import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  type AdmissionSource,
  isAdmissionSource,
} from '@/lib/event-ticket-email-copy'

export type { AdmissionSource }
import { sendEventTicketEmail } from '@/lib/transactional-email'
import type { CreditKind, RegistrationMethod } from '@/lib/membership-tier-config'

export const EVENT_TICKET_EMAIL_LEASE_SECONDS = 20
export const EVENT_TICKET_EMAIL_TYPE = 'ticket_confirmation'
const ATTEMPT_CAP = 5

export type RegistrationKind = 'event_attendee' | 'guest_event_registration'

type AdminClient = SupabaseClient<Database>

export type AdmissionRow = {
  id: string
  kind: RegistrationKind
  eventId: string
  userId: string | null
  status: string
  paymentStatus: string | null
  confirmationCode: string | null
  confirmedAt: string | null
  admissionSource: AdmissionSource | null
  amountPaidCents: number | null
  amountCents: number | null
}

export type TicketEmailRow = {
  id: string
  registrationKind: RegistrationKind
  registrationId: string
  emailType: typeof EVENT_TICKET_EMAIL_TYPE
  status: 'pending' | 'processing' | 'sent' | 'failed'
  attempts: number
  claimToken: string | null
  leaseExpiresAt: string | null
  nextAttemptAt: string | null
  resendMessageId: string | null
  sentAt: string | null
  lastError: string | null
  creditsRemaining: number | null
}

export type ConfirmAdmissionJson =
  | {
      ok: true
      already_confirmed: boolean
      confirmation_code: string
      outbox_id: string | null
      registration_id: string
    }
  | { ok: false; error: string }

export type ConfirmEventAdmissionResult =
  | {
      ok: true
      alreadyConfirmed: boolean
      confirmationCode: string
      emailSent: boolean
    }
  | { ok: false; error: string }

type CommitInput = {
  registrationKind: RegistrationKind
  eventId: string
  userId?: string | null
  registrationId?: string | null
  admissionSource: AdmissionSource
  amountPaidCents: number | null
  paymentStatus?: string | null
  creditsRemaining?: number | null
}

function logTicket(code: string) {
  console.error('[event_ticket_email]', code)
}

function readJson(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return readJson(JSON.parse(value) as unknown)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function atOrBefore(left: string | null, right: string): boolean {
  if (!left) return false
  const first = Date.parse(left)
  const second = Date.parse(right)
  return Number.isFinite(first) && Number.isFinite(second) && first <= second
}

function before(left: string | null, right: string): boolean {
  if (!left) return false
  const first = Date.parse(left)
  const second = Date.parse(right)
  return Number.isFinite(first) && Number.isFinite(second) && first > second
}

/**
 * Same confirmation rules as confirm_event_admission.
 * A confirmed row keeps its code and is not updated.
 */
export function commitEventAdmission(
  registration: AdmissionRow,
  outbox: TicketEmailRow | null,
  input: CommitInput,
  deps: {
    now: string
    allocateCode: () => string
    allocateOutboxId: () => string
  }
): {
  registration: AdmissionRow
  outbox: TicketEmailRow | null
  result: ConfirmAdmissionJson
} {
  const matches =
    input.registrationKind === registration.kind &&
    input.eventId === registration.eventId &&
    (registration.kind === 'event_attendee'
      ? input.userId === registration.userId
      : input.registrationId === registration.id)

  if (!matches) {
    return {
      registration,
      outbox,
      result: { ok: false, error: 'registration_not_found' },
    }
  }

  if (
    registration.kind === 'guest_event_registration' &&
    input.admissionSource !== 'paid'
  ) {
    return {
      registration,
      outbox,
      result: { ok: false, error: 'invalid_admission_source' },
    }
  }

  if (registration.confirmedAt) {
    return {
      registration,
      outbox,
      result: {
        ok: true,
        already_confirmed: true,
        confirmation_code: registration.confirmationCode ?? '',
        outbox_id: outbox?.id ?? null,
        registration_id: registration.id,
      },
    }
  }

  const confirmable =
    registration.kind === 'event_attendee'
      ? registration.status === 'going' && registration.paymentStatus !== 'pending'
      : registration.status === 'paid'

  if (!confirmable) {
    return {
      registration,
      outbox,
      result: { ok: false, error: 'not_confirmed' },
    }
  }

  if (
    registration.kind === 'event_attendee' &&
    (input.amountPaidCents == null || input.amountPaidCents < 0)
  ) {
    return {
      registration,
      outbox,
      result: { ok: false, error: 'invalid_amount' },
    }
  }

  const confirmationCode = registration.confirmationCode ?? deps.allocateCode()
  const creditsRemaining =
    input.admissionSource === 'circle_social_credit' ||
    input.admissionSource === 'premium_event_credit'
      ? Math.max(input.creditsRemaining ?? 0, 0)
      : null
  const amountPaidCents =
    registration.kind === 'guest_event_registration'
      ? (registration.amountCents ?? 0)
      : input.amountPaidCents ?? 0

  const confirmed: AdmissionRow = {
    ...registration,
    status: registration.kind === 'guest_event_registration' ? 'paid' : 'going',
    paymentStatus: input.paymentStatus ?? registration.paymentStatus,
    confirmationCode,
    confirmedAt: deps.now,
    admissionSource: registration.admissionSource ?? input.admissionSource,
    amountPaidCents: registration.amountPaidCents ?? amountPaidCents,
  }
  const queued: TicketEmailRow = outbox ?? {
    id: deps.allocateOutboxId(),
    registrationKind: registration.kind,
    registrationId: registration.id,
    emailType: EVENT_TICKET_EMAIL_TYPE,
    status: 'pending',
    attempts: 0,
    claimToken: null,
    leaseExpiresAt: null,
    nextAttemptAt: deps.now,
    resendMessageId: null,
    sentAt: null,
    lastError: null,
    creditsRemaining,
  }

  return {
    registration: confirmed,
    outbox: queued,
    result: {
      ok: true,
      already_confirmed: false,
      confirmation_code: confirmationCode,
      outbox_id: queued.id,
      registration_id: registration.id,
    },
  }
}

export function claimEventTicketEmail(
  outbox: TicketEmailRow,
  now: string,
  leaseSeconds: number,
  allocateToken: () => string
): { outbox: TicketEmailRow; claimed: boolean } {
  const due =
    leaseSeconds > 0 &&
    leaseSeconds <= 120 &&
    outbox.attempts < ATTEMPT_CAP &&
    ((outbox.status === 'pending' && atOrBefore(outbox.nextAttemptAt, now)) ||
      (outbox.status === 'processing' && atOrBefore(outbox.leaseExpiresAt, now)))

  if (!due) return { outbox, claimed: false }

  const attempts = outbox.attempts + 1
  return {
    claimed: true,
    outbox: {
      ...outbox,
      status: 'processing',
      attempts,
      claimToken: allocateToken(),
      leaseExpiresAt: new Date(Date.parse(now) + leaseSeconds * 1000).toISOString(),
      nextAttemptAt: attempts >= ATTEMPT_CAP ? null : outbox.nextAttemptAt,
    },
  }
}

export function finishEventTicketEmail(
  outbox: TicketEmailRow,
  input: {
    claimToken: string
    succeeded: boolean
    resendMessageId: string | null
    lastError: string | null
    now: string
  }
): { outbox: TicketEmailRow; ok: boolean } {
  if (
    outbox.status !== 'processing' ||
    outbox.claimToken !== input.claimToken ||
    !before(outbox.leaseExpiresAt, input.now)
  ) {
    return { outbox, ok: false }
  }

  if (input.succeeded) {
    if (!input.resendMessageId?.trim()) return { outbox, ok: false }
    return {
      ok: true,
      outbox: {
        ...outbox,
        status: 'sent',
        resendMessageId: input.resendMessageId,
        sentAt: input.now,
        lastError: null,
        claimToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    }
  }

  const exhausted = outbox.attempts >= ATTEMPT_CAP
  return {
    ok: true,
    outbox: {
      ...outbox,
      status: exhausted ? 'failed' : 'pending',
      lastError: input.lastError ?? 'ticket_send_failed',
      claimToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: exhausted ? null : input.now,
      resendMessageId: null,
      sentAt: null,
    },
  }
}

/**
 * Credit tickets are sent only after the credit update changed exactly one row.
 * Included and free RSVPs do not consume a credit.
 */
export function memberTicketAdmission(input: {
  eventType: string
  method: RegistrationMethod | string
  creditKind?: CreditKind | null
  creditRowsChanged: number | null
  creditsRemaining: number | null
}): {
  admissionSource: AdmissionSource
  paymentStatus: 'not_required'
  amountPaidCents: 0
  creditsRemaining: number | null
} | null {
  if (input.method === 'credit') {
    if (input.creditRowsChanged !== 1) return null
    const kind =
      input.creditKind ??
      (input.eventType === 'circle_social' ? 'circle_social' : 'premium_event')
    return {
      admissionSource:
        kind === 'circle_social' ? 'circle_social_credit' : 'premium_event_credit',
      paymentStatus: 'not_required',
      amountPaidCents: 0,
      creditsRemaining: input.creditsRemaining ?? 0,
    }
  }

  if (input.method !== 'included_unlimited') return null
  return {
    admissionSource: input.eventType === 'standard_event' ? 'free' : 'included',
    paymentStatus: 'not_required',
    amountPaidCents: 0,
    creditsRemaining: null,
  }
}

/**
 * Admission for a Going row already covered by a credit, included seat, or
 * free seat. Paid Checkout rows are confirmed only by the Stripe webhook.
 */
export function satisfiedGoingAdmission(input: {
  eventType: string
  registrationMethod: string | null
  creditConsumed: boolean
  creditReturned: boolean
  creditsRemaining: number | null
}): {
  admissionSource: AdmissionSource
  paymentStatus: 'not_required'
  amountPaidCents: 0
  creditsRemaining: number | null
} | null {
  if (input.registrationMethod === 'paid_per_event') return null

  if (
    input.creditConsumed &&
    !input.creditReturned &&
    input.registrationMethod === 'credit'
  ) {
    return {
      admissionSource:
        input.eventType === 'circle_social'
          ? 'circle_social_credit'
          : 'premium_event_credit',
      paymentStatus: 'not_required',
      amountPaidCents: 0,
      creditsRemaining: input.creditsRemaining ?? 0,
    }
  }

  if (input.registrationMethod === 'included_unlimited') {
    return {
      admissionSource: input.eventType === 'standard_event' ? 'free' : 'included',
      paymentStatus: 'not_required',
      amountPaidCents: 0,
      creditsRemaining: null,
    }
  }

  return null
}

function parseConfirm(value: unknown): ConfirmAdmissionJson | null {
  const record = readJson(value)
  if (!record) return null
  if (record.ok !== true) {
    return {
      ok: false,
      error: typeof record.error === 'string' ? record.error : 'confirm_failed',
    }
  }
  if (typeof record.confirmation_code !== 'string' || !record.confirmation_code) {
    return null
  }
  return {
    ok: true,
    already_confirmed: record.already_confirmed === true,
    confirmation_code: record.confirmation_code,
    outbox_id: typeof record.outbox_id === 'string' ? record.outbox_id : null,
    registration_id:
      typeof record.registration_id === 'string' ? record.registration_id : '',
  }
}

async function claimOutbox(admin: AdminClient, outboxId: string) {
  const { data, error } = await admin.rpc('claim_event_ticket_email', {
    p_id: outboxId,
    p_lease_seconds: EVENT_TICKET_EMAIL_LEASE_SECONDS,
  })
  if (error) return null
  const row = readJson(readJson(data)?.row)
  if (!row || typeof row.claim_token !== 'string') return null
  return { claimToken: row.claim_token }
}

async function finishOutbox(
  admin: AdminClient,
  outboxId: string,
  claimToken: string,
  succeeded: boolean,
  resendMessageId: string | null,
  lastError: string | null
) {
  const { data, error } = await admin.rpc('finish_event_ticket_email', {
    p_id: outboxId,
    p_claim_token: claimToken,
    p_succeeded: succeeded,
    p_resend_message_id: resendMessageId,
    p_last_error: lastError,
  })
  if (error) return false
  return readJson(data)?.ok === true
}

async function loadOutboxContext(admin: AdminClient, outboxId: string, claimToken: string) {
  const { data, error } = await admin.rpc('load_event_ticket_email_context', {
    p_id: outboxId,
    p_claim_token: claimToken,
  })
  if (error) return null
  const context = readJson(readJson(data)?.context)
  if (!context || typeof context.to !== 'string' || !context.to.includes('@')) return null
  if (!isAdmissionSource(context.admission_source)) return null
  if (typeof context.confirmation_code !== 'string' || !context.confirmation_code) {
    return null
  }
  if (typeof context.amount_paid_cents !== 'number') return null
  return {
    to: context.to,
    attendeeName:
      typeof context.attendee_name === 'string' ? context.attendee_name : 'Guest',
    eventName: typeof context.event_name === 'string' ? context.event_name : 'your event',
    startsAt: typeof context.starts_at === 'string' ? context.starts_at : null,
    endsAt: typeof context.ends_at === 'string' ? context.ends_at : null,
    venue: typeof context.venue === 'string' ? context.venue : null,
    eventId: typeof context.event_id === 'string' ? context.event_id : '',
    coverImageUrl:
      typeof context.cover_image_url === 'string' && context.cover_image_url.trim()
        ? context.cover_image_url
        : null,
    firstName:
      typeof context.first_name === 'string' && context.first_name.trim()
        ? context.first_name
        : null,
    confirmationCode: context.confirmation_code,
    admissionSource: context.admission_source,
    amountPaidCents: context.amount_paid_cents,
    creditsRemaining:
      typeof context.credits_remaining === 'number' ? context.credits_remaining : null,
  }
}

export async function deliverEventTicketOutbox(
  admin: AdminClient,
  outboxId: string
): Promise<{ emailSent: boolean }> {
  for (let attempt = 0; attempt < ATTEMPT_CAP; attempt += 1) {
    const claim = await claimOutbox(admin, outboxId)
    if (!claim) return { emailSent: false }

    const context = await loadOutboxContext(admin, outboxId, claim.claimToken)
    if (!context) {
      const released = await finishOutbox(
        admin,
        outboxId,
        claim.claimToken,
        false,
        null,
        'missing_ticket_context'
      )
      if (!released) return { emailSent: false }
      continue
    }

    let delivered: Awaited<ReturnType<typeof sendEventTicketEmail>>
    try {
      delivered = await sendEventTicketEmail({
        to: context.to,
        eventName: context.eventName,
        venue: context.venue ?? '',
        attendeeName: context.attendeeName,
        firstName: context.firstName,
        admissionSource: context.admissionSource,
        amountPaidCents: context.amountPaidCents,
        creditsRemaining: context.creditsRemaining,
        confirmationCode: context.confirmationCode,
        startsAt: context.startsAt,
        endsAt: context.endsAt,
        eventId: context.eventId,
        coverImageUrl: context.coverImageUrl,
        outboxId,
      })
    } catch {
      const released = await finishOutbox(
        admin,
        outboxId,
        claim.claimToken,
        false,
        null,
        'ticket_send_failed'
      )
      if (!released) return { emailSent: false }
      continue
    }

    if (
      ('sent' in delivered && delivered.sent) ||
      ('captured' in delivered && delivered.captured)
    ) {
      const finished = await finishOutbox(
        admin,
        outboxId,
        claim.claimToken,
        true,
        delivered.id,
        null
      )
      if (!finished) logTicket('ticket_finish_failed')
      return { emailSent: true }
    }

    if ('retryable' in delivered && delivered.retryable) {
      const released = await finishOutbox(
        admin,
        outboxId,
        claim.claimToken,
        false,
        null,
        'concurrent_idempotent_requests'
      )
      if (!released) return { emailSent: false }
      continue
    }

    const reason =
      'skipped' in delivered && delivered.skipped
        ? 'email_not_configured'
        : 'resend_failed'
    const released = await finishOutbox(
      admin,
      outboxId,
      claim.claimToken,
      false,
      null,
      reason
    )
    if (!released) return { emailSent: false }
  }

  return { emailSent: false }
}

export async function confirmEventAdmission(
  admin: AdminClient,
  input: CommitInput
): Promise<ConfirmEventAdmissionResult> {
  try {
    const { data, error } = await admin.rpc('confirm_event_admission', {
      p_registration_kind: input.registrationKind,
      p_event_id: input.eventId,
      p_user_id: input.userId ?? null,
      p_registration_id: input.registrationId ?? null,
      p_admission_source: input.admissionSource,
      p_amount_paid_cents: input.amountPaidCents,
      p_payment_status: input.paymentStatus ?? null,
      p_credits_remaining: input.creditsRemaining ?? null,
    })
    if (error) {
      logTicket('confirm_failed')
      return { ok: false, error: 'confirm_failed' }
    }

    const parsed = parseConfirm(data)
    if (!parsed || !parsed.ok) {
      logTicket(parsed?.ok === false ? parsed.error : 'confirm_failed')
      return { ok: false, error: parsed?.ok === false ? parsed.error : 'confirm_failed' }
    }

    let emailSent = false
    if (parsed.outbox_id) {
      try {
        emailSent = (await deliverEventTicketOutbox(admin, parsed.outbox_id)).emailSent
      } catch {
        logTicket('ticket_send_failed')
      }
    }

    return {
      ok: true,
      alreadyConfirmed: parsed.already_confirmed,
      confirmationCode: parsed.confirmation_code,
      emailSent,
    }
  } catch {
    logTicket('confirm_failed')
    return { ok: false, error: 'confirm_failed' }
  }
}

export async function retryEventTicketEmail(
  admin: AdminClient,
  input: {
    registrationKind: RegistrationKind
    eventId: string
    userId?: string | null
    registrationId?: string | null
  }
): Promise<{ emailSent: boolean }> {
  try {
    const registrationId = await confirmedRegistrationId(admin, input)
    if (!registrationId) return { emailSent: false }

    const existing = await admin
      .from('event_ticket_emails')
      .select('id, status')
      .eq('registration_kind', input.registrationKind)
      .eq('registration_id', registrationId)
      .eq('email_type', EVENT_TICKET_EMAIL_TYPE)
      .maybeSingle()

    if (existing.error || !existing.data) return { emailSent: false }
    if (existing.data.status === 'sent' || existing.data.status === 'failed') {
      return { emailSent: false }
    }
    return deliverEventTicketOutbox(admin, existing.data.id)
  } catch {
    logTicket('ticket_send_failed')
    return { emailSent: false }
  }
}

async function confirmedRegistrationId(
  admin: AdminClient,
  input: {
    registrationKind: RegistrationKind
    eventId: string
    userId?: string | null
    registrationId?: string | null
  }
) {
  if (input.registrationKind === 'event_attendee') {
    if (!input.userId) return null
    const row = await admin
      .from('event_attendees')
      .select('id, confirmed_at')
      .eq('event_id', input.eventId)
      .eq('user_id', input.userId)
      .maybeSingle()
    if (row.error || !row.data?.confirmed_at) return null
    return row.data.id
  }

  if (!input.registrationId) return null
  const row = await admin
    .from('guest_event_registrations')
    .select('id, event_id, confirmed_at')
    .eq('id', input.registrationId)
    .maybeSingle()
  if (row.error || !row.data?.confirmed_at || row.data.event_id !== input.eventId) {
    return null
  }
  return row.data.id
}
