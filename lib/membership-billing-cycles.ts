import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import {
  ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD,
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  type CreditKind,
  type ProductTier,
} from '@/lib/membership-tier-config'
import type { EntitlementCycle } from '@/lib/membership-entitlements'
import {
  parseMembershipBilling,
  type MembershipBilling,
  type MembershipPlan,
} from '@/lib/membership-systems'
import { INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE } from '@/lib/membership-pricing-copy'
import { createAdminClient } from '@/lib/supabase/admin'

type CycleRow = {
  id: string
  user_id: string
  product_tier: 'inner_circle' | 'elite_circle'
  period_start: string
  period_end: string
  credits_granted: number | null
  credits_used: number
  guest_invites_granted?: number
  guest_invites_used?: number
  circle_social_credits_granted?: number | null
  circle_social_credits_used?: number
  is_active: boolean
}

const CYCLE_SELECT_FULL =
  'id, user_id, product_tier, period_start, period_end, credits_granted, credits_used, guest_invites_granted, guest_invites_used, circle_social_credits_granted, circle_social_credits_used, is_active'

const CYCLE_SELECT_WITH_GUESTS =
  'id, user_id, product_tier, period_start, period_end, credits_granted, credits_used, guest_invites_granted, guest_invites_used, is_active'

const CYCLE_SELECT_LEGACY =
  'id, user_id, product_tier, period_start, period_end, credits_granted, credits_used, is_active'

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (error.code === '42P01' || error.code === '42703') return true
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('circle_social_credits') ||
    message.includes('guest_invites') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

/**
 * Entitlement cycle writes require a client that can UPDATE the table.
 * RLS historically only allowed SELECT for authenticated members, so the
 * user-scoped client silently no-ops updates. Prefer the service-role client.
 */
function entitlementWriteClient(
  fallback: SupabaseClient<Database>
): SupabaseClient<Database> {
  return createAdminClient() ?? fallback
}

function defaultPeriodEnd(plan: MembershipPlan, from = new Date()): Date {
  const end = new Date(from)
  if (plan === 'annual') {
    end.setFullYear(end.getFullYear() + 1)
  } else if (plan === 'quarterly') {
    end.setMonth(end.getMonth() + 3)
  } else {
    end.setMonth(end.getMonth() + 1)
  }
  return end
}

function toCycle(row: CycleRow): EntitlementCycle {
  return {
    id: row.id,
    product_tier: row.product_tier,
    period_start: row.period_start,
    period_end: row.period_end,
    credits_granted: row.credits_granted,
    credits_used: row.credits_used,
    guest_invites_granted: row.guest_invites_granted ?? 0,
    guest_invites_used: row.guest_invites_used ?? 0,
    circle_social_credits_granted: row.circle_social_credits_granted ?? null,
    circle_social_credits_used: row.circle_social_credits_used ?? 0,
    is_active: row.is_active,
  }
}

export async function loadActiveEntitlementCycle(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<EntitlementCycle | null> {
  const { data, error } = await supabase
    .from('membership_entitlement_cycles')
    .select(CYCLE_SELECT_FULL)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) {
      const withGuests = await supabase
        .from('membership_entitlement_cycles')
        .select(CYCLE_SELECT_WITH_GUESTS)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (withGuests.error) {
        if (isMissingColumnError(withGuests.error)) {
          const fallback = await supabase
            .from('membership_entitlement_cycles')
            .select(CYCLE_SELECT_LEGACY)
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (fallback.error) {
            if (fallback.error.code === '42P01') return null
            throw new Error(fallback.error.message)
          }
          return fallback.data ? toCycle(fallback.data as CycleRow) : null
        }
        throw new Error(withGuests.error.message)
      }
      return withGuests.data ? toCycle(withGuests.data as CycleRow) : null
    }
    throw new Error(error.message)
  }

  return data ? toCycle(data as CycleRow) : null
}

export async function loadActiveEntitlementCyclesByUserIds(
  supabase: SupabaseClient<Database>,
  userIds: string[]
): Promise<Map<string, EntitlementCycle>> {
  const map = new Map<string, EntitlementCycle>()
  if (userIds.length === 0) return map

  const { data, error } = await supabase
    .from('membership_entitlement_cycles')
    .select(CYCLE_SELECT_FULL)
    .in('user_id', userIds)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return map
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    const typed = row as CycleRow
    if (!map.has(typed.user_id)) {
      map.set(typed.user_id, toCycle(typed))
    }
  }

  return map
}

export async function loadExpiredActiveCircleCycles(
  supabase: SupabaseClient<Database>,
  now: Date = new Date()
): Promise<Array<{ userId: string; cycle: EntitlementCycle }>> {
  const periodEnd = now.toISOString()
  const { data, error } = await supabase
    .from('membership_entitlement_cycles')
    .select(CYCLE_SELECT_FULL)
    .eq('is_active', true)
    .in('product_tier', ['inner_circle', 'elite_circle'])
    .lte('period_end', periodEnd)

  if (error) {
    if (error.code === '42P01') return []
    if (isMissingColumnError(error)) {
      const fallback = await supabase
        .from('membership_entitlement_cycles')
        .select(CYCLE_SELECT_LEGACY)
        .eq('is_active', true)
        .in('product_tier', ['inner_circle', 'elite_circle'])
        .lte('period_end', periodEnd)
      if (fallback.error) {
        if (fallback.error.code === '42P01') return []
        throw new Error(fallback.error.message)
      }
      return (fallback.data ?? []).map((row) => {
        const typed = row as CycleRow & { user_id: string }
        return { userId: typed.user_id, cycle: toCycle(typed) }
      })
    }
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => {
    const typed = row as CycleRow & { user_id: string }
    return { userId: typed.user_id, cycle: toCycle(typed) }
  })
}

export async function deactivateExpiredEntitlementCycle(
  supabase: SupabaseClient<Database>,
  cycleId: string,
  now: Date = new Date()
): Promise<boolean> {
  const db = entitlementWriteClient(supabase)
  const { data, error } = await db
    .from('membership_entitlement_cycles')
    .update({ is_active: false })
    .eq('id', cycleId)
    .eq('is_active', true)
    .lte('period_end', now.toISOString())
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') return false
    throw new Error(error.message)
  }

  return Boolean(data)
}

export async function deactivateActiveCycles(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  await supabase
    .from('membership_entitlement_cycles')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)
}

function creditsAndGuestsForTier(productTier: 'inner_circle' | 'elite_circle'): {
  creditsGranted: number
  guestInvitesGranted: number
  circleSocialCreditsGranted: number | null
} {
  if (productTier === 'inner_circle') {
    return {
      creditsGranted: INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
      guestInvitesGranted: 0,
      circleSocialCreditsGranted: INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
    }
  }
  return {
    creditsGranted: ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
    guestInvitesGranted: ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD,
    circleSocialCreditsGranted: null,
  }
}

export async function startEntitlementCycle(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    productTier: 'inner_circle' | 'elite_circle'
    plan?: MembershipPlan
    periodStart?: Date
    periodEnd?: Date
  }
): Promise<EntitlementCycle> {
  const periodStart = input.periodStart ?? new Date()
  const plan = input.plan ?? 'monthly'
  const periodEnd = input.periodEnd ?? defaultPeriodEnd(plan, periodStart)
  const { creditsGranted, guestInvitesGranted, circleSocialCreditsGranted } =
    creditsAndGuestsForTier(input.productTier)

  await deactivateActiveCycles(supabase, input.userId)

  const { data, error } = await supabase
    .from('membership_entitlement_cycles')
    .insert({
      user_id: input.userId,
      product_tier: input.productTier,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      credits_granted: creditsGranted,
      credits_used: 0,
      guest_invites_granted: guestInvitesGranted,
      guest_invites_used: 0,
      circle_social_credits_granted: circleSocialCreditsGranted,
      circle_social_credits_used: 0,
      is_active: true,
    })
    .select(CYCLE_SELECT_FULL)
    .single()

  if (error) {
    if (isMissingColumnError(error)) {
      const withGuests = await supabase
        .from('membership_entitlement_cycles')
        .insert({
          user_id: input.userId,
          product_tier: input.productTier,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          credits_granted: creditsGranted,
          credits_used: 0,
          guest_invites_granted: guestInvitesGranted,
          guest_invites_used: 0,
          is_active: true,
        })
        .select(CYCLE_SELECT_WITH_GUESTS)
        .single()
      if (withGuests.error) {
        if (withGuests.error.message?.includes('guest_invites')) {
          const legacy = await supabase
            .from('membership_entitlement_cycles')
            .insert({
              user_id: input.userId,
              product_tier: input.productTier,
              period_start: periodStart.toISOString(),
              period_end: periodEnd.toISOString(),
              credits_granted: creditsGranted,
              credits_used: 0,
              is_active: true,
            })
            .select(CYCLE_SELECT_LEGACY)
            .single()
          if (legacy.error) throw new Error(legacy.error.message)
          return toCycle(legacy.data as CycleRow)
        }
        throw new Error(withGuests.error.message)
      }
      return toCycle(withGuests.data as CycleRow)
    }
    throw new Error(error.message)
  }

  return toCycle(data as CycleRow)
}

export function billingWithPaidTier(
  existing: MembershipBilling,
  productTier: 'inner_circle' | 'elite_circle',
  plan: MembershipPlan = 'monthly',
  periodStart: Date,
  periodEnd: Date
): MembershipBilling {
  return {
    ...existing,
    tier: productTier,
    plan,
    subscription_status: 'active',
    renewal_at: periodEnd.toISOString(),
    cancelled_at: null,
    plan_change_pending: null,
    payment_failure: {
      active: false,
      since: null,
      reminder_sent_at: null,
    },
    billing_period_start: periodStart.toISOString(),
    billing_period_end: periodEnd.toISOString(),
    stripe_customer_id: existing.stripe_customer_id ?? null,
    stripe_subscription_id: existing.stripe_subscription_id ?? null,
  }
}

export async function upgradeMembershipTier(
  supabase: SupabaseClient<Database>,
  userId: string,
  productTier: 'inner_circle' | 'elite_circle',
  plan: MembershipPlan = 'monthly'
): Promise<{ billing: MembershipBilling; cycle: EntitlementCycle }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('membership_billing')
    .eq('id', userId)
    .single()

  const existing = parseMembershipBilling(profile?.membership_billing)
  const periodStart = new Date()
  const periodEnd = defaultPeriodEnd(plan, periodStart)
  const billing = billingWithPaidTier(
    existing,
    productTier,
    plan,
    periodStart,
    periodEnd
  )

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      membership_billing: billing,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const cycle = await startEntitlementCycle(supabase, {
    userId,
    productTier,
    plan,
    periodStart,
    periodEnd,
  })

  return { billing, cycle }
}

export async function renewEntitlementCycle(
  supabase: SupabaseClient<Database>,
  userId: string,
  productTier: 'inner_circle' | 'elite_circle',
  plan: MembershipPlan = 'monthly'
): Promise<EntitlementCycle> {
  const periodStart = new Date()
  const periodEnd = defaultPeriodEnd(plan, periodStart)
  return startEntitlementCycle(supabase, {
    userId,
    productTier,
    plan,
    periodStart,
    periodEnd,
  })
}

const MAX_CREDIT_CONSUME_ATTEMPTS = 3

type CreditConsumeResult = {
  creditsRemaining: number
  creditsGranted: number
  creditsUsed: number
}

function creditColumns(kind: CreditKind): {
  granted: 'credits_granted' | 'circle_social_credits_granted'
  used: 'credits_used' | 'circle_social_credits_used'
  exhausted: string
} {
  if (kind === 'circle_social') {
    return {
      granted: 'circle_social_credits_granted',
      used: 'circle_social_credits_used',
      exhausted: INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE,
    }
  }
  return {
    granted: 'credits_granted',
    used: 'credits_used',
    exhausted: 'No included premium event credits remaining this billing period.',
  }
}

type CycleCreditRead = {
  id: string
  is_active: boolean
  credits_granted?: number | null
  credits_used?: number
  circle_social_credits_granted?: number | null
  circle_social_credits_used?: number
}

function readCreditBalance(row: CycleCreditRead, kind: CreditKind): {
  granted: number | null
  used: number
} {
  if (kind === 'circle_social') {
    return {
      granted: row.circle_social_credits_granted ?? null,
      used: row.circle_social_credits_used ?? 0,
    }
  }
  return {
    granted: row.credits_granted ?? null,
    used: row.credits_used ?? 0,
  }
}

export async function consumeEntitlementCredit(
  supabase: SupabaseClient<Database>,
  cycleId: string,
  kind: CreditKind
): Promise<CreditConsumeResult> {
  const db = entitlementWriteClient(supabase)
  const cols = creditColumns(kind)

  for (let attempt = 0; attempt < MAX_CREDIT_CONSUME_ATTEMPTS; attempt++) {
    const selectColumns =
      kind === 'circle_social'
        ? 'id, circle_social_credits_granted, circle_social_credits_used, is_active'
        : 'id, credits_granted, credits_used, is_active'

    const { data: cycle, error: readError } = await db
      .from('membership_entitlement_cycles')
      .select(selectColumns)
      .eq('id', cycleId)
      .single()

    if (readError || !cycle) {
      throw new Error(readError?.message ?? 'Entitlement cycle not found.')
    }

    const row = cycle as CycleCreditRead
    if (!row.is_active) {
      throw new Error('Billing period has ended. Credits cannot be used.')
    }

    const { granted: grantedRaw, used } = readCreditBalance(row, kind)
    if (kind === 'circle_social' && grantedRaw == null) {
      throw new Error(
        'Circle Social credits are not metered for this billing period.'
      )
    }

    const granted = grantedRaw ?? 0
    if (used >= granted) {
      throw new Error(cols.exhausted)
    }

    const nextUsed = used + 1
    const updateQuery =
      kind === 'circle_social'
        ? db
            .from('membership_entitlement_cycles')
            .update({ circle_social_credits_used: nextUsed })
            .eq('id', cycleId)
            .eq('is_active', true)
            .eq('circle_social_credits_used', used)
            .select('id, circle_social_credits_granted, circle_social_credits_used')
            .maybeSingle()
        : db
            .from('membership_entitlement_cycles')
            .update({ credits_used: nextUsed })
            .eq('id', cycleId)
            .eq('is_active', true)
            .eq('credits_used', used)
            .select('id, credits_granted, credits_used')
            .maybeSingle()

    const { data: updated, error: updateError } = await updateQuery

    if (updateError) {
      throw new Error(updateError.message)
    }

    if (!updated) {
      continue
    }

    const updatedRow = updated as CycleCreditRead
    const persisted = readCreditBalance(updatedRow, kind)
    if (persisted.used !== nextUsed) {
      continue
    }

    const creditsGranted = persisted.granted ?? granted
    return {
      creditsRemaining: Math.max(0, creditsGranted - persisted.used),
      creditsGranted,
      creditsUsed: persisted.used,
    }
  }

  throw new Error(
    'Credit consumption did not persist. Check entitlement-cycle update permissions (service role / RLS).'
  )
}

export async function consumeEventCredit(
  supabase: SupabaseClient<Database>,
  cycleId: string
): Promise<CreditConsumeResult> {
  return consumeEntitlementCredit(supabase, cycleId, 'premium_event')
}

export async function consumeCircleSocialCredit(
  supabase: SupabaseClient<Database>,
  cycleId: string
): Promise<CreditConsumeResult> {
  return consumeEntitlementCredit(supabase, cycleId, 'circle_social')
}

export async function returnGuestInvite(
  supabase: SupabaseClient<Database>,
  cycleId: string
): Promise<void> {
  const db = entitlementWriteClient(supabase)
  const { data: cycle } = await db
    .from('membership_entitlement_cycles')
    .select('guest_invites_used')
    .eq('id', cycleId)
    .single()

  if (!cycle || (cycle.guest_invites_used ?? 0) <= 0) return

  const nextUsed = Math.max(0, (cycle.guest_invites_used ?? 0) - 1)
  const { data: updated, error } = await db
    .from('membership_entitlement_cycles')
    .update({ guest_invites_used: nextUsed })
    .eq('id', cycleId)
    .select('guest_invites_used')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (!updated || updated.guest_invites_used !== nextUsed) {
    throw new Error(
      'Guest invite return did not persist. Check entitlement-cycle update permissions.'
    )
  }
}

export async function consumeGuestInvite(
  supabase: SupabaseClient<Database>,
  cycleId: string
): Promise<{ guestInvitesRemaining: number }> {
  const db = entitlementWriteClient(supabase)
  const { data: cycle, error: readError } = await db
    .from('membership_entitlement_cycles')
    .select('id, guest_invites_granted, guest_invites_used, is_active')
    .eq('id', cycleId)
    .single()

  if (readError || !cycle) {
    throw new Error(readError?.message ?? 'Entitlement cycle not found.')
  }

  if (!cycle.is_active) {
    throw new Error('Billing period has ended. Guest invites cannot be used.')
  }

  const granted = cycle.guest_invites_granted ?? 0
  const used = cycle.guest_invites_used ?? 0
  if (used >= granted) {
    throw new Error('No guest invites remaining this billing period.')
  }

  const nextUsed = used + 1
  const { data: updated, error: updateError } = await db
    .from('membership_entitlement_cycles')
    .update({ guest_invites_used: nextUsed })
    .eq('id', cycleId)
    .eq('is_active', true)
    .select('id, guest_invites_granted, guest_invites_used')
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }
  if (!updated || updated.guest_invites_used !== nextUsed) {
    throw new Error(
      'Guest invite consumption did not persist. Check entitlement-cycle update permissions.'
    )
  }

  const invitesGranted = updated.guest_invites_granted ?? granted
  return {
    guestInvitesRemaining: Math.max(0, invitesGranted - updated.guest_invites_used),
  }
}

export async function returnEventCredit(
  supabase: SupabaseClient<Database>,
  cycleId: string
): Promise<void> {
  return returnEntitlementCredit(supabase, cycleId, 'premium_event')
}

export async function returnCircleSocialCredit(
  supabase: SupabaseClient<Database>,
  cycleId: string
): Promise<void> {
  return returnEntitlementCredit(supabase, cycleId, 'circle_social')
}

async function returnEntitlementCredit(
  supabase: SupabaseClient<Database>,
  cycleId: string,
  kind: CreditKind
): Promise<void> {
  const db = entitlementWriteClient(supabase)
  const selectColumn =
    kind === 'circle_social' ? 'circle_social_credits_used' : 'credits_used'
  const { data: cycle } = await db
    .from('membership_entitlement_cycles')
    .select(selectColumn)
    .eq('id', cycleId)
    .single()

  const row = cycle as CycleCreditRead | null
  const used =
    kind === 'circle_social'
      ? (row?.circle_social_credits_used ?? 0)
      : (row?.credits_used ?? 0)
  if (!row || used <= 0) return

  const nextUsed = Math.max(0, used - 1)
  const updateQuery =
    kind === 'circle_social'
      ? db
          .from('membership_entitlement_cycles')
          .update({ circle_social_credits_used: nextUsed })
          .eq('id', cycleId)
          .select('circle_social_credits_used')
          .maybeSingle()
      : db
          .from('membership_entitlement_cycles')
          .update({ credits_used: nextUsed })
          .eq('id', cycleId)
          .select('credits_used')
          .maybeSingle()

  const { data: updated, error } = await updateQuery

  if (error) {
    throw new Error(error.message)
  }
  const persisted = updated as CycleCreditRead | null
  const persistedUsed =
    kind === 'circle_social'
      ? persisted?.circle_social_credits_used
      : persisted?.credits_used
  if (!persisted || persistedUsed !== nextUsed) {
    throw new Error(
      'Credit return did not persist. Check entitlement-cycle update permissions.'
    )
  }
}

export async function appendRegistrationLedger(
  supabase: SupabaseClient<Database>,
  entry: {
    userId: string
    eventId: string
    action: string
    registrationMethod?: string | null
    entitlementCycleId?: string | null
    creditDelta?: number
    metadata?: Record<string, unknown>
  }
) {
  const db = entitlementWriteClient(supabase)
  const { error } = await db.from('event_registration_ledger').insert({
    user_id: entry.userId,
    event_id: entry.eventId,
    action: entry.action,
    registration_method: entry.registrationMethod ?? null,
    entitlement_cycle_id: entry.entitlementCycleId ?? null,
    credit_delta: entry.creditDelta ?? 0,
    metadata: (entry.metadata ?? {}) as Json,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export function mapLegacyTierToProduct(tier: string | null | undefined): ProductTier {
  if (tier === 'inner_circle') return 'inner_circle'
  if (tier === 'elite_circle' || tier === 'premium_member') return 'elite_circle'
  return 'member'
}
