import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCuratedIntroApprovedEmail } from '@/lib/curated-intro-email'
import { resolveMemberMessagingAccess } from '@/lib/curated-intro-messaging-access'
import {
  ENDED_MEMBERSHIP_PERK_COPY,
  membershipCardDisplay,
} from '@/lib/membership-card-display'
import {
  CONNECT_DISCOVERY_WITHOUT_MESSAGING_COPY,
  CONNECT_MEMBERSHIP_INCLUDED_COPY,
} from '@/lib/membership-pricing-copy'
import {
  buildMemberEntitlements,
  canUseMessaging,
} from '@/lib/membership-entitlements'
import { emptyMembershipBilling } from '@/lib/membership-systems'
import { effectivePublicTier } from '@/lib/public-member-badges'
import { STRIPE_LIVE_PRICE_IDS } from '@/lib/stripe/config'
import {
  buildSyncedMembershipBilling,
  shouldApplyStripeBillingEvent,
} from '@/lib/stripe/membership-billing-sync'
import type { MembershipBilling } from '@/lib/membership-systems'

const repoRoot = join(__dirname, '..')
const now = new Date('2026-10-09T16:00:00.000Z')
const periodStart = new Date('2026-10-01T00:00:00.000Z')
const periodEnd = new Date('2026-11-01T00:00:00.000Z')

function sync(existing: MembershipBilling, input: {
  status: 'active' | 'canceled' | 'incomplete' | 'paused'
  tier: 'connect' | 'inner_circle' | 'elite_circle' | null
  priceId: string | null
  cancelAtPeriodEnd?: boolean
  eventCreated: number
  periodEnd?: Date
}) {
  return buildSyncedMembershipBilling({
    existing,
    subscriptionStatus: input.status,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    mappedTier: input.tier,
    priceId: input.priceId,
    periodStart,
    periodEnd: input.periodEnd ?? periodEnd,
    customerId: 'cus_test',
    subscriptionId: 'sub_test',
    trialEnd: null,
    eventCreated: input.eventCreated,
    now,
  })
}

describe('paid messaging entitlement', () => {
  it('does not treat an approved curated intro as messaging access', async () => {
    const access = await resolveMemberMessagingAccess({} as never, {
      userId: 'member-1',
      canMessage: false,
      messagingSuspended: false,
      conversationId: 'conversation-1',
    })
    expect(access.canAccessConversation).toBe(false)
    expect(access.introOnlyAccess).toBe(false)
    expect(canUseMessaging(
      buildMemberEntitlements({
        applicationApproved: true,
        billing: {
          tier: 'elite_circle',
          subscription_status: 'cancelled',
        },
      })
    )).toBe(false)
  })

  it('does not grant messaging from an active community_partner label', () => {
    const partner = buildMemberEntitlements({
      applicationApproved: true,
      billing: {
        ...emptyMembershipBilling(),
        tier: 'community_partner',
        subscription_status: 'active',
      },
      now,
    })
    expect(partner.productTier).toBe('elite_circle')
    expect(partner.canMessage).toBe(false)

    const withOverride = buildMemberEntitlements({
      applicationApproved: true,
      billing: {
        ...emptyMembershipBilling(),
        tier: 'community_partner',
        subscription_status: 'none',
      },
      accessOverride: {
        tier: 'inner_circle',
        startsAt: '2026-10-01T00:00:00.000Z',
        expiresAt: null,
      },
      now,
    })
    expect(withOverride.canMessage).toBe(true)
  })

  it('does not grant messaging from admin role or a stale Elite label', () => {
    const cancelledElite = {
      ...emptyMembershipBilling(),
      tier: 'elite_circle' as const,
      subscription_status: 'cancelled' as const,
      stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
      stripe_customer_id: 'cus_test',
    }
    const admin = buildMemberEntitlements({
      role: 'admin',
      applicationApproved: true,
      billing: cancelledElite,
      now,
    })
    expect(admin.billingProductTier).toBe('member')
    expect(admin.canMessage).toBe(false)
    expect(effectivePublicTier({ role: 'admin', billing: cancelledElite, now })).toBeNull()

    const member = buildMemberEntitlements({
      role: 'member',
      applicationApproved: true,
      billing: cancelledElite,
      now,
    })
    expect(member.canMessage).toBe(false)
    expect(effectivePublicTier({ role: 'member', billing: cancelledElite, now })).toBeNull()
  })

  it('keeps access through a period-end cancellation and ends it immediately otherwise', () => {
    const scheduled = sync(emptyMembershipBilling(), {
      status: 'active',
      tier: 'connect',
      priceId: STRIPE_LIVE_PRICE_IDS.connect,
      cancelAtPeriodEnd: true,
      eventCreated: 2,
    })
    const scheduledEntitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: scheduled,
      now,
    })
    expect(scheduledEntitlements.canMessage).toBe(true)
    expect(scheduledEntitlements.billingProductTier).toBe('connect')
    const scheduledCard = membershipCardDisplay(scheduledEntitlements)
    expect(scheduledCard.title).toBe('Connect')
    expect(scheduledCard.statusLabel).toMatch(/^Active until /)

    const endedPeriod = sync(scheduled, {
      status: 'active',
      tier: 'connect',
      priceId: STRIPE_LIVE_PRICE_IDS.connect,
      cancelAtPeriodEnd: true,
      eventCreated: 3,
      periodEnd: new Date('2026-10-01T00:00:00.000Z'),
    })
    expect(
      buildMemberEntitlements({
        applicationApproved: true,
        billing: endedPeriod,
        now,
      }).canMessage
    ).toBe(false)

    const immediate = sync(scheduled, {
      status: 'canceled',
      tier: 'connect',
      priceId: STRIPE_LIVE_PRICE_IDS.connect,
      eventCreated: 4,
    })
    const immediateEntitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: immediate,
      now,
    })
    expect(immediate.tier).toBe('member')
    expect(immediate.subscription_status).toBe('cancelled')
    expect(immediate.stripe_price_id).toBeNull()
    expect(immediateEntitlements.canMessage).toBe(false)
    expect(periodEnd.getTime()).toBeGreaterThan(now.getTime())
  })

  it('follows Elite to Connect to an immediate cancellation without leftover Elite access', () => {
    const elite = sync(emptyMembershipBilling(), {
      status: 'active',
      tier: 'elite_circle',
      priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
      eventCreated: 10,
    })
    const connect = sync(elite, {
      status: 'active',
      tier: 'connect',
      priceId: STRIPE_LIVE_PRICE_IDS.connect,
      eventCreated: 20,
    })
    expect(connect.tier).toBe('connect')
    expect(
      shouldApplyStripeBillingEvent({
        existingEventCreated: 20,
        incomingEventCreated: 10,
        existingStatus: 'active',
        incomingStatus: 'active',
      })
    ).toBe(false)

    const cancelled = sync(connect, {
      status: 'canceled',
      tier: 'connect',
      priceId: STRIPE_LIVE_PRICE_IDS.connect,
      eventCreated: 30,
    })
    expect(cancelled.tier).toBe('member')
    expect(cancelled.ended_paid_tier).toBe('connect')
    expect(cancelled.subscription_status).toBe('cancelled')

    expect(
      shouldApplyStripeBillingEvent({
        existingEventCreated: cancelled.stripe_event_created,
        incomingEventCreated: 15,
        existingStatus: cancelled.subscription_status,
        incomingStatus: 'active',
      })
    ).toBe(false)

    const entitlements = buildMemberEntitlements({
      role: 'admin',
      applicationApproved: true,
      billing: cancelled,
      now,
    })
    const card = membershipCardDisplay(entitlements)
    expect(entitlements.canMessage).toBe(false)
    expect(entitlements.billingProductTier).toBe('member')
    expect(card.title).toBe('Member')
    expect(card.statusLabel).toBe('Cancelled')
    expect(card.perkLines).toEqual([ENDED_MEMBERSHIP_PERK_COPY])
    expect(card.historyLabel).toContain('Connect')
    expect(card.historyLabel).not.toContain('Elite Circle')
    expect(card.useCircleCreditSnapshot).toBe(false)
    expect(effectivePublicTier({ role: 'member', billing: cancelled, now })).toBeNull()
  })
})

describe('grace messaging policy', () => {
  const graceBilling = (
    tier: 'connect' | 'inner_circle' | 'elite_circle' | 'premium_member' | 'member'
  ) => ({
    ...emptyMembershipBilling(),
    tier,
    subscription_status: 'grace' as const,
    stripe_price_id: STRIPE_LIVE_PRICE_IDS.elite_circle,
    billing_period_end: periodEnd.toISOString(),
  })

  it('denies grace for each historical paid tier and a stored price', () => {
    for (const tier of ['connect', 'inner_circle', 'elite_circle', 'premium_member'] as const) {
      const entitlements = buildMemberEntitlements({
        applicationApproved: true,
        billing: graceBilling(tier),
        now,
      })
      expect(entitlements.canMessage, tier).toBe(false)
      if (tier === 'connect') {
        expect(entitlements.productTier).toBe('connect')
        expect(entitlements.canUseCuratedMatching).toBe(false)
        expect(membershipCardDisplay(entitlements).perkLines).toEqual([
          CONNECT_DISCOVERY_WITHOUT_MESSAGING_COPY,
        ])
      }
      if (tier === 'inner_circle' || tier === 'elite_circle') {
        expect(entitlements.productTier).toBe(tier)
        expect(entitlements.canUseCuratedMatching).toBe(true)
      }
    }

    const storedPrice = buildMemberEntitlements({
      applicationApproved: true,
      billing: graceBilling('member'),
      now,
    })
    expect(storedPrice.canMessage).toBe(false)
    expect(storedPrice.productTier).toBe('member')
  })

  it('denies messaging when an active subscription becomes incomplete or paused', () => {
    const active = sync(emptyMembershipBilling(), {
      status: 'active',
      tier: 'elite_circle',
      priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
      eventCreated: 10,
    })
    expect(
      buildMemberEntitlements({
        applicationApproved: true,
        billing: active,
        now,
      }).canMessage
    ).toBe(true)

    for (const status of ['incomplete', 'paused'] as const) {
      const grace = sync(active, {
        status,
        tier: 'elite_circle',
        priceId: STRIPE_LIVE_PRICE_IDS.elite_circle,
        eventCreated: 11,
      })
      expect(grace.subscription_status).toBe('grace')
      expect(grace.tier).toBe('elite_circle')
      expect(grace.stripe_price_id).toBe(STRIPE_LIVE_PRICE_IDS.elite_circle)
      const entitlements = buildMemberEntitlements({
        applicationApproved: true,
        billing: grace,
        now,
      })
      expect(entitlements.canMessage, status).toBe(false)
      expect(entitlements.canUseCuratedMatching).toBe(true)
    }
  })

  it('denies manual grace and allows only a current complimentary override', () => {
    const billing = graceBilling('connect')
    expect(
      buildMemberEntitlements({
        applicationApproved: true,
        billing,
        now,
      }).canMessage
    ).toBe(false)

    expect(
      buildMemberEntitlements({
        applicationApproved: true,
        billing,
        accessOverride: {
          tier: 'inner_circle',
          startsAt: '2026-10-01T00:00:00.000Z',
          expiresAt: '2026-12-01T00:00:00.000Z',
        },
        now,
      }).canMessage
    ).toBe(true)

    expect(
      buildMemberEntitlements({
        applicationApproved: true,
        billing,
        accessOverride: {
          tier: 'elite_circle',
          startsAt: '2026-09-01T00:00:00.000Z',
          expiresAt: '2026-10-01T00:00:00.000Z',
        },
        now,
      }).canMessage
    ).toBe(false)

    expect(
      buildMemberEntitlements({
        applicationApproved: true,
        billing,
        accessOverride: {
          tier: 'elite_circle',
          startsAt: '2026-09-01T00:00:00.000Z',
          expiresAt: null,
          revokedAt: '2026-10-02T00:00:00.000Z',
        },
        now,
      }).canMessage
    ).toBe(false)
  })

  it('keeps messaging through a scheduled cancellation inside the paid period', () => {
    const entitlements = buildMemberEntitlements({
      applicationApproved: true,
      billing: {
        ...emptyMembershipBilling(),
        tier: 'connect',
        subscription_status: 'active',
        cancel_at_period_end: true,
        billing_period_end: periodEnd.toISOString(),
        stripe_price_id: STRIPE_LIVE_PRICE_IDS.connect,
      },
      now,
    })
    expect(entitlements.canMessage).toBe(true)
    expect(membershipCardDisplay(entitlements).statusLabel).toBe(
      'Active until Nov 1, 2026'
    )
    expect(membershipCardDisplay(entitlements).perkLines).toEqual([
      CONNECT_MEMBERSHIP_INCLUDED_COPY,
    ])
  })
})

describe.sequential('curated intro email dispatch', () => {
  it('captures the rendered paid and unpaid messages without calling Resend', async () => {
    const { mkdtemp, readdir, readFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'hsc-email-capture-'))
    process.env.EMAIL_CAPTURE_DIR = dir
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3010'
    delete process.env.RESEND_API_KEY

    const { sendCuratedIntroApprovedEmail } = await import(
      '@/lib/transactional-email'
    )
    const conversationId = '4ddae001-12a0-4cc3-97c4-c6fafa3b2f68'
    const paid = await sendCuratedIntroApprovedEmail({
      to: 'paid@messaging-lab.test',
      otherMemberName: 'Unpaid Member',
      conversationId,
      audience: 'requester',
      recipientEntitled: true,
    })
    const unpaid = await sendCuratedIntroApprovedEmail({
      to: 'unpaid@messaging-lab.test',
      otherMemberName: 'Paid Member',
      conversationId,
      audience: 'target',
      recipientEntitled: false,
    })

    expect(paid).toEqual({ captured: true })
    expect(unpaid).toEqual({ captured: true })

    const files = (await readdir(dir)).filter((name) => name.endsWith('.html'))
    expect(files).toHaveLength(2)
    const html = await Promise.all(
      files.map((name) => readFile(join(dir, name), 'utf8'))
    )
    const paidHtml = html.find((body) => body.includes('Open conversation'))
    const unpaidHtml = html.find((body) => body.includes('View memberships'))
    expect(paidHtml).toContain(
      `href="http://localhost:3010/messages/${conversationId}"`
    )
    expect(paidHtml).not.toMatch(/href="[^"]*\/upgrade"/)
    expect(paidHtml).not.toMatch(/without upgrading/i)
    expect(unpaidHtml).toContain('href="http://localhost:3010/upgrade"')
    expect(unpaidHtml).not.toContain('/messages/')
    expect(unpaidHtml).toMatch(/active paid membership is required/i)
  })

  it('does not let EMAIL_CAPTURE_DIR suppress production delivery', async () => {
    const { mkdtemp, readdir } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'hsc-email-capture-'))
    const previousNodeEnv = process.env.NODE_ENV
    process.env.EMAIL_CAPTURE_DIR = dir
    process.env.NODE_ENV = 'production'
    process.env.VERCEL_ENV = 'production'
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NEXT_PUBLIC_APP_URL = 'https://members.example'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { sendCuratedIntroApprovedEmail } = await import('@/lib/transactional-email')
      const result = await sendCuratedIntroApprovedEmail({
        to: 'paid@messaging-lab.test',
        otherMemberName: 'Unpaid Member',
        conversationId: '4ddae001-12a0-4cc3-97c4-c6fafa3b2f68',
        recipientEntitled: true,
        audience: 'requester',
      })
      expect(result).toEqual({ sent: true })
      expect(fetchMock).toHaveBeenCalledOnce()
      const request = fetchMock.mock.calls[0]?.[1] as RequestInit
      const body = JSON.parse(String(request.body)) as { html: string }
      expect(body.html).toContain('https://members.example/messages/')
      expect(await readdir(dir)).toEqual([])
      const vercel = readFileSync(join(repoRoot, 'vercel.json'), 'utf8')
      expect(vercel).not.toContain('EMAIL_CAPTURE_DIR')
    } finally {
      vi.unstubAllGlobals()
      delete process.env.EMAIL_CAPTURE_DIR
      delete process.env.VERCEL_ENV
      delete process.env.RESEND_API_KEY
      process.env.NODE_ENV = previousNodeEnv
    }
  })
})

describe('curated intro emails', () => {
  it('sends a conversation link only to the entitled recipient', () => {
    const paid = buildCuratedIntroApprovedEmail({
      entitled: true,
      audience: 'requester',
      otherMemberName: 'Jordan',
      conversationId: 'conversation-1',
      origin: 'https://club.example',
    })
    const unpaid = buildCuratedIntroApprovedEmail({
      entitled: false,
      audience: 'target',
      otherMemberName: 'Alex',
      conversationId: 'conversation-1',
      origin: 'https://club.example',
    })

    expect(paid.opensConversation).toBe(true)
    expect(paid.cta.href).toBe('https://club.example/messages/conversation-1')
    expect(paid.bodyHtml).toMatch(/available in Messages/)
    expect(paid.bodyHtml + paid.text + paid.cta.href).not.toMatch(/without upgrading/i)

    expect(unpaid.opensConversation).toBe(false)
    expect(unpaid.cta.href).toBe('https://club.example/upgrade')
    expect(unpaid.bodyHtml).toMatch(/active paid membership is required/i)
    expect(unpaid.bodyHtml + unpaid.text + unpaid.cta.href).not.toContain('/messages/')
    expect(unpaid.bodyHtml).not.toMatch(/without upgrading/i)
  })

  it('uses the deployed conversation route instead of notFound', () => {
    const page = readFileSync(
      join(repoRoot, 'app/(club)/messages/[conversationId]/page.tsx'),
      'utf8'
    )
    expect(page).not.toContain('notFound(')
    expect(page).toContain('An active paid membership is required')
    expect(page).toContain('Conversation unavailable')
    const email = readFileSync(join(repoRoot, 'lib/curated-intro-email.ts'), 'utf8')
    expect(email).toContain('return `/messages/${conversationId}`')
  })
})

describe('database policies', () => {
  it('requires paid messaging in conversation policies and keeps admin read access', () => {
    const sql = readFileSync(
      join(repoRoot, 'supabase/migrations/20261009153000_paid_messaging_access.sql'),
      'utf8'
    )
    expect(sql).toContain('member_has_paid_messaging')
    expect(sql).toContain("if status = 'active'")
    expect(sql).not.toContain("status in ('active', 'grace')")
    expect(sql).toContain('public.is_admin')
    expect(sql).not.toMatch(/curated intro/i)
    expect(sql).toContain('apply_membership_billing_sync')
  })
})
