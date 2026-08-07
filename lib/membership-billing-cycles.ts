import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import {
  ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD,
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  type ProductTier,
} from '@/lib/membership-tier-config'
import type { EntitlementCycle } from '@/lib/membership-entitlements'
import {
  parseMembershipBilling,
  type MembershipBilling,
  type MembershipPlan,
} from '@/lib/membership-systems'
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
  is_active: boolean
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
    is_active: row.is_active,
  }
}

export async function loadActiveEntitlementCycle(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<EntitlementCycle | null> {
  const { data, error } = await supabase
    .from('membership_entitlement_cycles')
    .select(
      'id, user_id, product_tier, period_start, period_end, credits_granted, credits_used, guest_invites_granted, guest_invites_used, is_active'
    )
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01' || error.message?.includes('guest_invites')) {
      const fallback = await supabase
        .from('membership_entitlement_cycles')
        .select(
          'id, user_id, product_tier, period_start, period_end, credits_granted, credits_used, is_active'
        )
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
    throw new Error(error.message)
  }

  return data ? toCycle(data as CycleRow) : null
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
} {
  if (productTier === 'inner_circle') {
    return {
      creditsGranted: INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
      guestInvitesGranted: 0,
    }
  }
  return {
    creditsGranted: ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
    guestInvitesGranted: ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD,
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
  const { creditsGranted, guestInvitesGranted } = creditsAndGuestsForTier(
    input.productTier
  )

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
      is_active: true,
    })
    .select(
      'id, user_id, product_tier, period_start, period_end, credits_granted, credits_used, guest_invites_granted, guest_invites_used, is_active'
    )
    .single()

  if (error) {
    // Fallback if guest invite columns are not migrated yet.
    if (error.message?.includes('guest_invites')) {
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
        .select(
          'id, user_id, product_tier, period_start, period_end, credits_granted, credits_used, is_active'
        )
        .single()
      if (legacy.error) throw new Error(legacy.error.message)
      return toCycle(legacy.data as CycleRow)
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

export async function consumeEventCredit(
  supabase: SupabaseClient<Database>,
  cycleId: string
): Promise<{ creditsRemaining: number; creditsGranted: number; creditsUsed: number }> {
  const db = entitlementWriteClient(supabase)

  const { data: cycle, error: readError } = await db
    .from('membership_entitlement_cycles')
    .select('id, credits_granted, credits_used, is_active')
    .eq('id', cycleId)
    .single()

  if (readError || !cycle) {
    throw new Error(readError?.message ?? 'Entitlement cycle not found.')
  }

  if (!cycle.is_active) {
    throw new Error('Billing period has ended. Credits cannot be used.')
  }

  const granted = cycle.credits_granted ?? 0
  const used = cycle.credits_used ?? 0
  if (used >= granted) {
    throw new Error(
      'No included premium event credits remaining this billing period.'
    )
  }

  const nextUsed = used + 1
  const { data: updated, error: updateError } = await db
    .from('membership_entitlement_cycles')
    .update({ credits_used: nextUsed })
    .eq('id', cycleId)
    .eq('is_active', true)
    .select('id, credits_granted, credits_used')
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }

  // RLS can silently no-op updates (0 rows). Never report success without a row.
  if (!updated || updated.credits_used !== nextUsed) {
    throw new Error(
      'Credit consumption did not persist. Check entitlement-cycle update permissions (service role / RLS).'
    )
  }

  const creditsGranted = updated.credits_granted ?? granted
  return {
    creditsRemaining: Math.max(0, creditsGranted - updated.credits_used),
    creditsGranted,
    creditsUsed: updated.credits_used,
  }
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
  const db = entitlementWriteClient(supabase)
  const { data: cycle } = await db
    .from('membership_entitlement_cycles')
    .select('credits_used')
    .eq('id', cycleId)
    .single()

  if (!cycle || (cycle.credits_used ?? 0) <= 0) return

  const nextUsed = Math.max(0, (cycle.credits_used ?? 0) - 1)
  const { data: updated, error } = await db
    .from('membership_entitlement_cycles')
    .update({ credits_used: nextUsed })
    .eq('id', cycleId)
    .select('credits_used')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (!updated || updated.credits_used !== nextUsed) {
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
