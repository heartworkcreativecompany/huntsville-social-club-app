'use server'

import {
  buildCuratedIntroApprovedEmail,
  type CuratedIntroEmailAudience,
} from '@/lib/curated-intro-email'
import {
  buildEventTicketMessage,
  type EventTicketMessageInput,
} from '@/lib/event-ticket-email-copy'
import { appOrigin, SUPPORT_EMAIL } from '@/lib/site'

type EmailPayload = {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
}

function emailCaptureDirectory(): string | null {
  const captureDir = process.env.EMAIL_CAPTURE_DIR?.trim()
  if (!captureDir) return null
  // Production delivery must not be replaced by a local capture directory.
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  ) {
    return null
  }
  return captureDir
}

let emailCaptureSequence = 0

async function sendEmail(payload: EmailPayload) {
  const captureDir = emailCaptureDirectory()
  if (captureDir) {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await mkdir(captureDir, { recursive: true })
    const slug = payload.subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)
    const stamp = `${Date.now()}-${emailCaptureSequence++}-${slug || 'email'}`
    await writeFile(join(captureDir, `${stamp}.html`), payload.html, 'utf8')
    await writeFile(
      join(captureDir, `${stamp}.json`),
      JSON.stringify(
        { to: payload.to, subject: payload.subject, text: payload.text },
        null,
        2
      ),
      'utf8'
    )
    return { captured: true as const }
  }

  const apiKey = process.env.RESEND_API_KEY
  const from =
    process.env.EMAIL_FROM ??
    'Huntsville Social Club <onboarding@resend.dev>'

  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[email skipped — set RESEND_API_KEY]', {
        to: payload.to,
        subject: payload.subject,
      })
    }
    return { skipped: true as const }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(payload.idempotencyKey
        ? { 'Idempotency-Key': payload.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  })

  if (response.status === 409) {
    const detail = await response.text()
    if (resendErrorName(detail) === 'concurrent_idempotent_requests') {
      console.error('[email failed] concurrent_idempotent_requests')
      return { retryable: true as const }
    }
    console.error('[email failed]', detail)
    return { error: 'Email delivery failed.' as const }
  }

  if (!response.ok) {
    const detail = await response.text()
    console.error('[email failed]', detail)
    return { error: 'Email delivery failed.' as const }
  }

  const body = (await response.json().catch(() => null)) as { id?: unknown } | null
  const id = body && typeof body.id === 'string' ? body.id : null
  if (!id) {
    return { error: 'Email delivery failed.' as const }
  }

  return { sent: true as const, id }
}

function resendErrorName(detail: string): string | null {
  try {
    const parsed = JSON.parse(detail) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  } catch {
    return null
  }
}

function emailShell(
  title: string,
  body: string,
  cta?: { label: string; href: string },
  plainText?: string
) {
  const origin = appOrigin()
  const logoUrl = `${origin}/brand/HSC-white-gold-logo.png`
  const ctaBlock = cta
    ? `<p style="margin:24px 0;"><a href="${cta.href}" style="background:#af8b5a;color:#1d1f1d;padding:12px 24px;border-radius:9999px;text-decoration:none;display:inline-block;font-family:'Montserrat',system-ui,sans-serif;font-weight:600;">${cta.label}</a></p>`
    : ''

  const html = `
    <div style="font-family:'Raleway',system-ui,sans-serif;max-width:520px;margin:0 auto;color:#ffffff;line-height:1.5;background:#1d1f1d;padding:24px;">
      <img src="${logoUrl}" alt="Huntsville Social Club" width="240" style="height:auto;max-width:240px;display:block;margin-bottom:16px;" />
      <h1 style="font-family:'Montserrat',system-ui,sans-serif;font-size:22px;font-weight:600;margin:16px 0;color:#af8b5a;">${title}</h1>
      ${body}
      ${ctaBlock}
      <p style="margin-top:32px;font-size:13px;color:#d8d4cc;">Questions? Reply to ${SUPPORT_EMAIL}</p>
      <p style="font-size:12px;color:#9a968f;">${origin}</p>
    </div>
  `

  const textBody = plainText ?? body.replace(/<[^>]+>/g, '')
  const text = `${title}\n\n${textBody}${cta ? `\n\n${cta.label}: ${cta.href}` : ''}\n\nQuestions: ${SUPPORT_EMAIL}`

  return { html, text }
}

export async function sendApplicationSubmittedEmail(to: string) {
  const origin = appOrigin()
  const { html, text } = emailShell(
    'Application received',
    `<p>Your membership application has been submitted. Our team will review it and update your status in the app.</p>
     <p>You can track progress anytime on your application status page.</p>`,
    { label: 'View application status', href: `${origin}/application/status` }
  )

  return sendEmail({ to, subject: 'Application submitted', html, text })
}

export async function sendApplicationApprovedEmail(to: string) {
  const origin = appOrigin()
  const { html, text } = emailShell(
    'Membership approved',
    `<p>Welcome to the club. Your membership is active — browse events, connect with verified members, and keep your profile current.</p>`,
    { label: 'Go to Members', href: `${origin}/members` }
  )

  return sendEmail({ to, subject: 'Membership approved', html, text })
}

export async function sendApplicationRejectedEmail(
  to: string,
  notes?: string | null
) {
  const origin = appOrigin()
  const noteBlock = notes?.trim()
    ? `<p><strong>Reviewer note:</strong> ${notes.trim()}</p>`
    : ''

  const { html, text } = emailShell(
    'Application update',
    `<p>Your membership application was not approved at this time.</p>
     ${noteBlock}
     <p>If you have questions, reach out to our team.</p>`,
    { label: 'View application', href: `${origin}/application/status` }
  )

  return sendEmail({ to, subject: 'Application update', html, text })
}

export async function sendApplicationNeedsInfoEmail(
  to: string,
  notes?: string | null
) {
  const origin = appOrigin()
  const noteBlock = notes?.trim()
    ? `<p><strong>What we need:</strong> ${notes.trim()}</p>`
    : '<p>Please review your application and provide the requested updates.</p>'

  const { html, text } = emailShell(
    'More information needed',
    `<p>We reviewed your application and need a few updates before we can continue.</p>
     ${noteBlock}`,
    { label: 'Update application', href: `${origin}/application` }
  )

  return sendEmail({
    to,
    subject: 'Application — more information needed',
    html,
    text,
  })
}

export async function sendProfileRevisionSubmittedEmail(to: string) {
  const origin = appOrigin()
  const { html, text } = emailShell(
    'Profile changes submitted',
    `<p>Your profile edits have been submitted for staff review. Your current public profile stays live until we approve the changes.</p>
     <p>We will email you when the review is complete.</p>`,
    { label: 'View your profile', href: `${origin}/profile` }
  )

  return sendEmail({
    to,
    subject: 'Profile changes submitted for review',
    html,
    text,
  })
}

export async function sendProfileRevisionApprovedEmail(to: string) {
  const origin = appOrigin()
  const { html, text } = emailShell(
    'Profile changes approved',
    `<p>Your profile updates are now live in the member directory.</p>`,
    { label: 'View your profile', href: `${origin}/profile` }
  )

  return sendEmail({
    to,
    subject: 'Profile changes approved',
    html,
    text,
  })
}

export async function sendProfileRevisionRejectedEmail(
  to: string,
  notes?: string | null
) {
  const origin = appOrigin()
  const noteBlock = notes?.trim()
    ? `<p><strong>Staff note:</strong> ${notes.trim()}</p>`
    : ''

  const { html, text } = emailShell(
    'Profile changes not approved',
    `<p>Your recent profile edits were not approved. Your previously approved public profile is unchanged.</p>
     ${noteBlock}
     <p>You can edit and submit again anytime from your profile page.</p>`,
    { label: 'Edit profile', href: `${origin}/profile` }
  )

  return sendEmail({
    to,
    subject: 'Profile changes not approved',
    html,
    text,
  })
}

export async function sendCuratedIntroApprovedEmail(input: {
  to: string
  otherMemberName: string
  conversationId: string
  audience: CuratedIntroEmailAudience
  recipientEntitled: boolean
}) {
  const content = buildCuratedIntroApprovedEmail({
    entitled: input.recipientEntitled,
    audience: input.audience,
    otherMemberName: input.otherMemberName,
    conversationId: input.conversationId,
    origin: appOrigin(),
  })
  const { html, text } = emailShell(content.title, content.bodyHtml, content.cta)

  return sendEmail({
    to: input.to,
    subject: content.subject,
    html,
    text,
  })
}

export async function sendCuratedIntroMatchedEmail(input: {
  to: string
  otherMemberName: string
  conversationId: string
  recipientEntitled: boolean
}) {
  return sendCuratedIntroApprovedEmail({
    ...input,
    audience: 'requester',
  })
}

export async function sendCuratedIntroMatchedTargetEmail(input: {
  to: string
  otherMemberName: string
  conversationId: string
  recipientEntitled: boolean
}) {
  return sendCuratedIntroApprovedEmail({
    ...input,
    audience: 'target',
  })
}

export async function sendCuratedIntroDeclinedEmail(input: {
  to: string
  otherMemberName: string
}) {
  const origin = appOrigin()
  const { html, text } = emailShell(
    'Curated intro update',
    `<p>We reviewed your intro request for <strong>${input.otherMemberName}</strong> and are not moving forward with that connection at this time.</p>
     <p>Your matches inbox has been updated with this recommendation in your archive. New curated recommendations may still arrive in future batches.</p>`,
    { label: 'View matches', href: `${origin}/matches/dating` }
  )

  return sendEmail({
    to: input.to,
    subject: 'Curated intro update',
    html,
    text,
  })
}

export async function sendCuratedMatchesDeliveredEmail(input: {
  to: string
  memberName: string
  matchCount: number
}) {
  const origin = appOrigin()
  const matchLabel =
    input.matchCount === 1
      ? '1 new curated recommendation'
      : `${input.matchCount} new curated recommendations`

  const { html, text } = emailShell(
    'New curated matches',
    `<p>Hi ${input.memberName},</p>
     <p>You have <strong>${matchLabel}</strong> waiting in your matches inbox.</p>
     <p>Review the profiles, send a message request when someone feels right, or pass if it is not a fit. A conversation opens only if they accept.</p>`,
    { label: 'View matches', href: `${origin}/matches/dating` }
  )

  return sendEmail({
    to: input.to,
    subject: 'New curated matches in your inbox',
    html,
    text,
  })
}

export async function sendEventTicketEmail(
  input: EventTicketMessageInput & {
    to: string
    outboxId: string
  }
) {
  const message = buildEventTicketMessage({
    ...input,
    origin: appOrigin(),
  })
  const result = await sendEmail({
    to: input.to,
    subject: message.subject,
    html: message.html,
    text: message.plainText,
    idempotencyKey: `event-ticket/${input.outboxId}`,
  })

  if ('sent' in result && result.sent) {
    return { sent: true as const, id: result.id }
  }
  if ('captured' in result && result.captured) {
    return { captured: true as const, id: 'captured' }
  }
  if ('retryable' in result && result.retryable) {
    return { retryable: true as const }
  }
  if ('skipped' in result && result.skipped) {
    return { skipped: true as const }
  }
  return { error: 'error' in result ? result.error : ('Email delivery failed.' as const) }
}
