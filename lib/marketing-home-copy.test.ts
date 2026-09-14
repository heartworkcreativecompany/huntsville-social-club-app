import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APPLY_FOR_FREE_MEMBERSHIP_CTA,
  FINAL_CTA_REASSURANCE,
  FOUNDER_NOTE_PLACEHOLDER_BODY,
  HOME_HERO_HEADLINE,
  HOME_HERO_MICROCOPY,
  HOME_MEMBERSHIP_TIERS,
  HOW_MEMBERSHIP_WORKS_STEPS,
  IMPLIED_EXPERIENCES,
  MEMBERSHIP_VALUE_HEADLINE,
  PUBLIC_SIGNUP_PATH,
  WHY_EXISTS_HEADLINE,
} from '@/lib/marketing-home-copy'
import { PRICING_PLANS, PRICING_SUPPORTING_LINE } from '@/lib/membership-pricing-copy'

const repoRoot = join(__dirname, '..')

describe('public homepage copy', () => {
  it('keeps the primary CTA and signup destination aligned with account creation', () => {
    expect(APPLY_FOR_FREE_MEMBERSHIP_CTA).toBe('Apply for free membership')
    expect(PUBLIC_SIGNUP_PATH).toBe('/signup')
    expect(HOME_HERO_HEADLINE).toBe('Your next favorite people are in Huntsville.')
    expect(HOME_HERO_MICROCOPY).toContain('after approval')
    expect(PRICING_SUPPORTING_LINE).toContain('All memberships begin with approval')
  })

  it('uses verified membership names and prices without invented discounts', () => {
    expect(HOME_MEMBERSHIP_TIERS.map((tier) => tier.name)).toEqual([
      PRICING_PLANS.member.name,
      PRICING_PLANS.connect.name,
      PRICING_PLANS.inner_circle.name,
      PRICING_PLANS.elite_circle.name,
    ])
    expect(HOME_MEMBERSHIP_TIERS.map((tier) => tier.price)).toEqual([
      PRICING_PLANS.member.price,
      PRICING_PLANS.connect.price,
      PRICING_PLANS.inner_circle.price,
      PRICING_PLANS.elite_circle.price,
    ])
    expect(MEMBERSHIP_VALUE_HEADLINE).toBe('Start free. Upgrade when it fits your life.')
  })

  it('explains joining without promising automatic acceptance or a review clock', () => {
    expect(HOW_MEMBERSHIP_WORKS_STEPS[2]).toContain('review every application')
    expect(HOW_MEMBERSHIP_WORKS_STEPS.join(' ')).not.toMatch(/\d+\s*(hours?|days?)/i)
    expect(FINAL_CTA_REASSURANCE).toBe('Free to apply. Thoughtful review. No pressure.')
  })

  it('describes implied plans rather than public event listings', () => {
    expect(IMPLIED_EXPERIENCES.map((item) => item.description)).toContain(
      'Dinner and drinks at local spots.'
    )
    expect(WHY_EXISTS_HEADLINE).toBe(
      'Huntsville is growing. Connection should grow with it.'
    )
  })
})

describe('public homepage source protections', () => {
  const page = readFileSync(join(repoRoot, 'app/page.tsx'), 'utf8')
  const content = readFileSync(
    join(repoRoot, 'components/marketing/public-home-content.tsx'),
    'utf8'
  )
  const header = readFileSync(
    join(repoRoot, 'components/marketing/public-home-header.tsx'),
    'utf8'
  )
  const founder = readFileSync(
    join(repoRoot, 'components/marketing/founder-note-placeholder.tsx'),
    'utf8'
  )
  const combined = `${page}\n${content}\n${header}`

  it('does not fetch or link member-only events', () => {
    expect(combined).not.toMatch(/from '@\/app\/\(club\)\/events/)
    expect(combined).not.toMatch(/href=["']\/events/)
    expect(combined).not.toContain('See upcoming events')
    expect(combined).not.toContain('starts_at')
    expect(content).not.toContain('createClient')
  })

  it('keeps landing CTAs on the signup path through portalCtaHref', () => {
    expect(page).toContain("portalCtaHref(hostKind, '/login')")
    expect(page).toContain("portalCtaHref(hostKind, '/signup')")
    expect(header).toContain('ApplyMembershipCta')
    expect(content).toContain('ApplyMembershipCta')
  })

  it('does not render fake testimonials or invented social proof', () => {
    expect(FOUNDER_NOTE_PLACEHOLDER_BODY).toBe(
      'This space is reserved for a future founder note or member stories. Nothing here is a testimonial yet.'
    )
    expect(founder).toContain('FOUNDER_NOTE_PLACEHOLDER_BODY')
    expect(founder).not.toMatch(/&ldquo;|&rdquo;|“|”/)
    expect(combined).not.toMatch(/\d[\d,]*\s+(members|guests|attendees)/i)
  })
})
