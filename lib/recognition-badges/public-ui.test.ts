import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import MemberDiscoveryCard from '@/components/members/member-discovery-card'
import MemberProfileDetailsPanel from '@/components/members/member-profile-details-panel'
import type { DirectoryMember } from '@/lib/members-discovery'
import { buildMemberEntitlements } from '@/lib/membership-entitlements'
import { evaluateFriendshipAccess } from '@/lib/friendship/eligibility'
import { freeMemberBilling, innerCircleBilling } from '@/lib/friendship/test-fixtures'

const stubMember: DirectoryMember = {
  id: 'member_abc',
  contactEmail: null,
  full_name: 'Alex Rivera',
  role: 'member',
  created_at: null,
  membership_intent: 'Looking to meet people at mixers.',
  verified_at: null,
  membership_status: 'approved',
  photos: [],
  location_area: 'Huntsville',
  discovery_intent: null,
  location_city: 'Huntsville',
  location_zip: null,
  birth_year: null,
  discovery_interests: [],
  discovery_industry: null,
  public_intents: [],
  verification_state: {},
  membership_tier: 'member',
  vendor_reviewed_badge: false,
  recognitionBadges: [
    { slug: 'founding_member', publicLabel: 'Founding Member' },
    { slug: 'premium_sponsor', publicLabel: 'Premium Sponsor' },
  ],
}

describe('public recognition badge rendering', () => {
  it('shows public labels on directory cards and omits private notes', () => {
    const html = renderToStaticMarkup(
      createElement(MemberDiscoveryCard, { member: stubMember })
    )
    expect(html).toContain('Founding Member')
    expect(html).toContain('Premium Sponsor')
    expect(html).not.toContain('founding_member')
    expect(html).not.toContain('admin_note')
    expect(html).not.toContain('Keep this private')
    expect(html).not.toContain('awarded_by')
  })

  it('shows public labels on member profiles and omits private notes', () => {
    const html = renderToStaticMarkup(
      createElement(MemberProfileDetailsPanel, { member: stubMember })
    )
    expect(html).toContain('Founding Member')
    expect(html).toContain('Premium Sponsor')
    expect(html).toContain('Alex Rivera')
    expect(html).not.toContain('Keep this private')
    expect(html).not.toContain('admin_note')
    expect(html).not.toContain('revoked')
  })

  it('does not render revoked or empty recognition badges', () => {
    const html = renderToStaticMarkup(
      createElement(MemberDiscoveryCard, {
        member: { ...stubMember, recognitionBadges: [] },
      })
    )
    expect(html).not.toContain('Founding Member')
    expect(html).not.toContain('Recognition badges')
  })
})

describe('recognition badges do not change existing access gates', () => {
  it('does not import billing, dating, friendship, or messaging modules', () => {
    const files = [
      'lib/recognition-badges/catalog.ts',
      'lib/recognition-badges/public.ts',
      'lib/recognition-badges/admin.ts',
      'components/admin/admin-member-badges-manager.tsx',
      'components/members/member-recognition-badges.tsx',
      'app/(club)/admin/users/[id]/badges/page.tsx',
      'app/(club)/admin/users/[id]/badges/actions.ts',
    ]
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source).not.toMatch(
        /from ['"]@\/lib\/(stripe|membership-entitlements|compatibility\/eligibility|friendship\/eligibility|member-messages)/
      )
    }
  })

  it('leaves Stripe, entitlements, Dating, Friendship, and messaging modules independent', () => {
    const files = [
      'lib/stripe/sync-subscription.ts',
      'lib/membership-entitlements.ts',
      'lib/compatibility/eligibility.ts',
      'lib/friendship/eligibility.ts',
      'lib/member-messages.ts',
    ]
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source).not.toContain('recognition-badges')
      expect(source).not.toContain('recognition_badge')
    }

    const entitlements = buildMemberEntitlements({
      applicationApproved: true,
      role: 'member',
      billing: innerCircleBilling,
      activeCycle: null,
    })
    expect(entitlements.canMessage).toBe(true)

    const friendship = evaluateFriendshipAccess({
      signedIn: true,
      approved: true,
      friendsIntent: true,
      entitlementInput: { billing: freeMemberBilling, applicationApproved: true },
      questionnaire: null,
    })
    expect(friendship.canViewSection).toBe(true)
  })
})
