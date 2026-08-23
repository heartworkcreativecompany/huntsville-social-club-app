import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberDiscoveryCard from '@/components/members/member-discovery-card'
import MemberProfileDetailsPanel from '@/components/members/member-profile-details-panel'
import type { DirectoryMember } from '@/lib/members-discovery'
import {
  buildDirectoryMember,
  directoryCardBadges,
  profilePageBadges,
} from '@/lib/members-discovery'
import {
  effectivePublicTier,
  publicMemberDisplayRevalidatePaths,
  toPublicVisibleBadgeDto,
  visiblePublicBadgeLabels,
  visiblePublicMemberBadges,
} from '@/lib/public-member-badges'
import { toPublicRecognitionBadges } from '@/lib/recognition-badges/catalog'
import { freeMemberBilling, innerCircleBilling } from '@/lib/friendship/test-fixtures'

const now = new Date('2026-08-23T18:00:00.000Z')

const eliteBilling = {
  ...innerCircleBilling,
  tier: 'elite_circle' as const,
}

const activeEliteOverride = {
  tier: 'elite_circle' as const,
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null as string | null,
  revokedAt: null as string | null,
}

const activeInnerOverride = {
  ...activeEliteOverride,
  tier: 'inner_circle' as const,
}

function member(overrides: Partial<DirectoryMember> = {}): DirectoryMember {
  return {
    id: 'member-1',
    contactEmail: null,
    full_name: 'Alex Rivera',
    role: 'member',
    created_at: null,
    membership_intent: null,
    verified_at: null,
    membership_status: 'approved',
    photos: [],
    location_area: null,
    discovery_intent: null,
    location_city: null,
    location_zip: null,
    birth_year: null,
    discovery_interests: [],
    discovery_industry: null,
    public_intents: [],
    verification_state: {},
    membership_tier: 'member',
    vendor_reviewed_badge: false,
    recognitionBadges: [],
    ...overrides,
  }
}

describe('effective public tier', () => {
  it('uses an active Elite override when Stripe is free', () => {
    expect(
      effectivePublicTier({
        role: 'member',
        billing: freeMemberBilling,
        accessOverride: activeEliteOverride,
        now,
      })
    ).toBe('elite_circle')
  })

  it('uses an active Inner override when Stripe is free', () => {
    expect(
      effectivePublicTier({
        role: 'member',
        billing: freeMemberBilling,
        accessOverride: activeInnerOverride,
        now,
      })
    ).toBe('inner_circle')
  })

  it('ignores expired, future, and revoked overrides', () => {
    expect(
      effectivePublicTier({
        role: 'member',
        billing: freeMemberBilling,
        now,
        accessOverride: {
          ...activeEliteOverride,
          expiresAt: '2026-08-01T00:00:00.000Z',
        },
      })
    ).toBeNull()

    expect(
      effectivePublicTier({
        role: 'member',
        billing: innerCircleBilling,
        now,
        accessOverride: {
          ...activeEliteOverride,
          startsAt: '2026-12-01T00:00:00.000Z',
        },
      })
    ).toBe('inner_circle')

    expect(
      effectivePublicTier({
        role: 'member',
        billing: eliteBilling,
        now,
        accessOverride: {
          ...activeInnerOverride,
          revokedAt: '2026-08-20T00:00:00.000Z',
        },
      })
    ).toBe('elite_circle')
  })

  it('keeps Stripe Elite and Inner without an override', () => {
    expect(
      effectivePublicTier({ role: 'member', billing: eliteBilling, now })
    ).toBe('elite_circle')
    expect(
      effectivePublicTier({ role: 'member', billing: innerCircleBilling, now })
    ).toBe('inner_circle')
    expect(
      effectivePublicTier({ role: 'member', billing: freeMemberBilling, now })
    ).toBeNull()
  })

  it('does not treat Admin or Host as a public paid tier', () => {
    expect(
      effectivePublicTier({
        role: 'admin',
        billing: freeMemberBilling,
        accessOverride: activeEliteOverride,
        now,
      })
    ).toBeNull()
    expect(
      effectivePublicTier({
        role: 'host',
        billing: innerCircleBilling,
        now,
      })
    ).toBeNull()
  })
})

describe('visible public member badges', () => {
  it('shows Member for a standard member', () => {
    expect(visiblePublicBadgeLabels(member())).toEqual(['Member'])
  })

  it('shows Founding Member only and hides Member', () => {
    expect(
      visiblePublicBadgeLabels(
        member({
          recognitionBadges: [
            { slug: 'founding_member', publicLabel: 'Founding Member' },
          ],
        })
      )
    ).toEqual(['Founding Member'])
  })

  it('shows Inner Circle only and hides Member', () => {
    expect(
      visiblePublicBadgeLabels(member({ membership_tier: 'inner_circle' }))
    ).toEqual(['Inner Circle'])
  })

  it('shows Elite Circle only and hides Member', () => {
    expect(
      visiblePublicBadgeLabels(member({ membership_tier: 'elite_circle' }))
    ).toEqual(['Elite Circle'])
  })

  it('shows Elite Circle then Founding Member and hides Member', () => {
    expect(
      visiblePublicBadgeLabels(
        member({
          membership_tier: 'elite_circle',
          recognitionBadges: [
            { slug: 'founding_member', publicLabel: 'Founding Member' },
          ],
        })
      )
    ).toEqual(['Elite Circle', 'Founding Member'])
  })

  it('shows multiple recognition badges in catalog order and hides Member', () => {
    expect(
      visiblePublicBadgeLabels(
        member({
          recognitionBadges: [
            { slug: 'experience_partner', publicLabel: 'Experience Partner' },
            { slug: 'founding_member', publicLabel: 'Founding Member' },
            { slug: 'premium_sponsor', publicLabel: 'Premium Sponsor' },
          ],
        })
      )
    ).toEqual([
      'Founding Member',
      'Premium Sponsor',
      'Experience Partner',
    ])
  })

  it('omits a revoked recognition badge and falls back to Member', () => {
    const publicBadges = toPublicRecognitionBadges([
      {
        badge_slug: 'founding_member',
        public_label: 'Founding Member',
        revoked_at: '2026-08-01T00:00:00.000Z',
      },
    ])
    expect(visiblePublicBadgeLabels(member({ recognitionBadges: publicBadges }))).toEqual(
      ['Member']
    )
  })

  it('uses the same list for directory cards and public profiles', () => {
    const alex = member({
      membership_tier: 'elite_circle',
      recognitionBadges: [
        { slug: 'founding_member', publicLabel: 'Founding Member' },
      ],
    })
    expect(directoryCardBadges(alex)).toEqual(profilePageBadges(alex))
    expect(directoryCardBadges(alex)).toEqual(visiblePublicMemberBadges(alex))
  })

  it('does not put override, billing, Stripe, reason, actor, or ids on the public DTO', () => {
    const built = buildDirectoryMember(
      {
        id: 'member-1',
        full_name: 'Alex Rivera',
        role: 'member',
        created_at: null,
        application_status: 'approved',
        membership_billing: freeMemberBilling,
      },
      { accessOverride: activeEliteOverride, now }
    )
    built.recognitionBadges = [
      { slug: 'founding_member', publicLabel: 'Founding Member' },
    ]

    expect(built.membership_tier).toBe('elite_circle')
    expect(built).not.toHaveProperty('accessOverride')
    expect(built).not.toHaveProperty('stripe_customer_id')
    expect(built).not.toHaveProperty('stripe_subscription_id')
    expect(JSON.stringify(built)).not.toContain('cus_test')
    expect(JSON.stringify(built)).not.toContain('Founding year')
    expect(JSON.stringify(built)).not.toContain('grantedBy')
    expect(JSON.stringify(built)).not.toContain('revokedAt')

    const dto = toPublicVisibleBadgeDto(visiblePublicMemberBadges(built))
    expect(dto).toEqual([
      { key: 'elite_circle', label: 'Elite Circle' },
      { key: 'founding_member', label: 'Founding Member' },
    ])
    expect(JSON.stringify(dto)).not.toMatch(
      /override|stripe|billing|reason|actor|admin_note|granted|revoked|expires|subscription/i
    )
  })
})

describe('override-aware directory member display', () => {
  it('shows Elite Circle from an active override with no Stripe paid tier', () => {
    const built = buildDirectoryMember(
      {
        id: 'member-1',
        full_name: 'Alex Rivera',
        role: 'member',
        created_at: null,
        application_status: 'approved',
        membership_billing: freeMemberBilling,
      },
      { accessOverride: activeEliteOverride, now }
    )
    expect(visiblePublicBadgeLabels(built)).toEqual(['Elite Circle'])
  })

  it('shows Inner Circle from an active override with no Stripe paid tier', () => {
    const built = buildDirectoryMember(
      {
        id: 'member-1',
        full_name: 'Alex Rivera',
        role: 'member',
        created_at: null,
        application_status: 'approved',
        membership_billing: freeMemberBilling,
      },
      { accessOverride: activeInnerOverride, now }
    )
    expect(visiblePublicBadgeLabels(built)).toEqual(['Inner Circle'])
  })

  it('shows Elite Circle then Founding Member for an override plus recognition', () => {
    const built = buildDirectoryMember(
      {
        id: 'member-1',
        full_name: 'Alex Rivera',
        role: 'member',
        created_at: null,
        application_status: 'approved',
        membership_billing: freeMemberBilling,
      },
      { accessOverride: activeEliteOverride, now }
    )
    built.recognitionBadges = [
      { slug: 'founding_member', publicLabel: 'Founding Member' },
    ]
    expect(visiblePublicBadgeLabels(built)).toEqual([
      'Elite Circle',
      'Founding Member',
    ])
  })
})

describe('directory card and public profile labels', () => {
  it('render identical visible labels', () => {
    const alex = member({
      membership_tier: 'elite_circle',
      recognitionBadges: [
        { slug: 'founding_member', publicLabel: 'Founding Member' },
      ],
    })
    const card = renderToStaticMarkup(
      createElement(MemberDiscoveryCard, { member: alex })
    )
    const profile = renderToStaticMarkup(
      createElement(MemberProfileDetailsPanel, { member: alex })
    )
    expect(card).toContain('Elite Circle')
    expect(card).toContain('Founding Member')
    expect(card).not.toMatch(/>Member</)
    expect(profile).toContain('Elite Circle')
    expect(profile).toContain('Founding Member')
    expect(profile).not.toMatch(/>Member</)
  })
})

describe('override grant/update/revoke revalidation', () => {
  it('revalidates the public member profile and directory routes', () => {
    expect(publicMemberDisplayRevalidatePaths('member-1')).toEqual([
      '/members',
      '/members/member-1',
      '/profile',
    ])
    const source = readFileSync(
      resolve(process.cwd(), 'app/(club)/admin/users/[id]/actions.ts'),
      'utf8'
    )
    expect(source).toContain('publicMemberDisplayRevalidatePaths')
    expect(source).toContain('grantMembershipAccessOverrideAction')
    expect(source).toContain('revokeMembershipAccessOverrideAction')
    expect(source).toContain('revalidateMemberAdminPaths(input.memberId)')
  })
})
