import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APPLY_FOR_FREE_MEMBERSHIP_CTA,
  APPLY_FOR_MEMBERSHIP_CTA,
  FINAL_CTA_REASSURANCE,
  HOME_HEADER_JOIN_CTA,
  HOME_HEADER_SIGN_IN,
  HOME_HERO_BODY,
  HOME_HERO_EYEBROW,
  HOME_HERO_HEADLINE,
  HOME_HERO_IMAGE_SRC,
  HOME_HERO_SUPPORT_LINE_PRIMARY,
  HOME_HERO_SUPPORT_LINE_SECONDARY,
  HOME_MEMBERSHIP_TIERS,
  HOW_MEMBERSHIP_WORKS_HEADLINE,
  HOW_MEMBERSHIP_WORKS_STEPS,
  IMPLIED_EXPERIENCES,
  MEMBERSHIP_VALUE_HEADLINE,
  PUBLIC_SIGNUP_PATH,
  WHO_IT_IS_FOR_HEADLINE,
  WHO_IT_IS_FOR_ITEMS,
  WHY_EXISTS_HEADLINE,
} from '@/lib/marketing-home-copy'
import { PRICING_PLANS, PRICING_SUPPORTING_LINE } from '@/lib/membership-pricing-copy'

const repoRoot = join(__dirname, '..')

describe('public homepage copy', () => {
  it('keeps the primary CTA and signup destination aligned with account creation', () => {
    expect(APPLY_FOR_FREE_MEMBERSHIP_CTA).toBe('Apply for free membership')
    expect(APPLY_FOR_MEMBERSHIP_CTA).toBe('Apply for Membership')
    expect(HOME_HEADER_SIGN_IN).toBe('Sign In')
    expect(HOME_HEADER_JOIN_CTA).toBe('Join the Club')
    expect(PUBLIC_SIGNUP_PATH).toBe('/signup')
    expect(HOME_HERO_EYEBROW).toBe('Huntsville, Alabama')
    expect(HOME_HERO_HEADLINE).toBe('Where Huntsville Connects')
    expect(HOME_HERO_BODY).toContain('Join the Huntsville Social Club to meet people')
    expect(HOME_HERO_BODY).not.toMatch(/speed dating|mixers|singles/i)
    expect(HOME_HERO_SUPPORT_LINE_PRIMARY).toBe('Free to apply.')
    expect(HOME_HERO_SUPPORT_LINE_SECONDARY).toContain('after approval')
    expect(HOME_HERO_IMAGE_SRC).toBe('/brand/hsc-hero-lounge-abstract-responsive.png')
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
    expect(HOW_MEMBERSHIP_WORKS_HEADLINE).toBe('Joining is simple.')
    expect(HOW_MEMBERSHIP_WORKS_STEPS).toEqual([
      'Create your account.',
      'Tell us a little about yourself through a short membership application.',
      'We review every application thoughtfully.',
      'Once approved, start connecting and join in when a gathering feels right.',
    ])
    expect(HOW_MEMBERSHIP_WORKS_STEPS.join(' ')).not.toMatch(/\d+\s*(hours?|days?)/i)
    expect(FINAL_CTA_REASSURANCE).toBe('Free to apply. Thoughtful review. No pressure.')
  })

  it('keeps six implied-plan cards with local images and no public calendar copy', () => {
    expect(IMPLIED_EXPERIENCES).toHaveLength(6)
    expect(IMPLIED_EXPERIENCES.map((item) => item.title)).toEqual([
      'Premium Nights Out',
      'Easy Daytime Plans',
      'Creative Activities',
      'Game Nights',
      'Outdoors and wellness',
      'Member-led plans',
    ])
    expect(IMPLIED_EXPERIENCES.map((item) => item.description)).toEqual([
      'Dinner and drinks, live events, and things worth experiencing together.',
      'Coffee, brunch, and easy daytime plans.',
      'Workshops and local experiences',
      'Interactive games with new friends',
      'Outdoors, wellness, and active gatherings.',
      'Member-led plans around shared interests.',
    ])
    expect(IMPLIED_EXPERIENCES.map((item) => item.imageSrc)).toEqual([
      '/brand/hsc-scene-dinner.jpg',
      '/brand/hsc-scene-cafe.jpg',
      '/brand/hsc-scene-workshop.jpg',
      '/brand/hsc-scene-game-night.jpg',
      '/brand/hsc-event-hike.jpeg',
      '/brand/hsc-scene-rooftop.jpg',
    ])
    expect(IMPLIED_EXPERIENCES[4]).toMatchObject({
      title: 'Outdoors and wellness',
      description: 'Outdoors, wellness, and active gatherings.',
      imageSrc: '/brand/hsc-event-hike.jpeg',
      imageAlt: 'An outdoor trail through trees',
    })
    expect(IMPLIED_EXPERIENCES[5]).toMatchObject({
      title: 'Member-led plans',
      description: 'Member-led plans around shared interests.',
      imageSrc: '/brand/hsc-scene-rooftop.jpg',
      imageAlt: 'Lounge seating on a rooftop terrace',
    })
    for (const item of IMPLIED_EXPERIENCES) {
      expect(item.imageSrc).toMatch(/^\/brand\//)
      expect(item.imageSrc).not.toMatch(/^https?:\/\//)
    }
    expect(WHY_EXISTS_HEADLINE).toBe(
      'Huntsville is growing. Connection should grow with it.'
    )
  })

  it('keeps the belonging statements exact', () => {
    expect(WHO_IT_IS_FOR_HEADLINE).toBe('You’ll probably feel at home here if you…')
    expect(WHO_IT_IS_FOR_ITEMS).toEqual([
      'Want more meaningful ways to meet people in Huntsville.',
      'Are open to trying new places and saying yes to plans.',
      'Value kindness, curiosity, and showing up for others.',
      'Want a welcoming community without forced networking.',
      'Are new to Huntsville, in a new season of life, or ready to expand your circle.',
    ])
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
  const copy = readFileSync(join(repoRoot, 'lib/marketing-home-copy.ts'), 'utf8')
  const combined = `${page}\n${content}\n${header}\n${copy}`

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
    expect(header).toContain('HOME_HEADER_JOIN_CTA')
    expect(header).toContain('signupHref')
    expect(content).toContain('ApplyMembershipCta')
    expect(content).toContain('APPLY_FOR_MEMBERSHIP_CTA')
    expect(content).toContain('w-fit')
  })

  it('places belonging immediately before joining and removes placeholders', () => {
    const whoIndex = content.indexOf('id="who-it-is-for-heading"')
    const joinIndex = content.indexOf('id="how-membership-works-heading"')
    const plansIndex = content.indexOf('id="implied-experiences-heading"')
    expect(whoIndex).toBeGreaterThan(plansIndex)
    expect(joinIndex).toBeGreaterThan(whoIndex)
    expect(content).not.toContain('SocialIntroVideo')
    expect(content).not.toContain('FounderNotePlaceholder')
    expect(content).not.toContain('SOCIAL_INTRO')
    expect(combined).not.toContain('See what a more connected Huntsville can feel like.')
    expect(combined).not.toContain('A short intro video is coming soon.')
    expect(combined).not.toContain('Coming later')
    expect(combined).not.toContain('A note from the founder')
    expect(combined).not.toMatch(/Small[- ][Gg]roup [Mm]oments/)
    expect(combined).not.toContain('Culture and nights out')
    expect(copy).not.toContain('/brand/hsc-event-rooftop.jpg')
    expect(combined).not.toMatch(/&ldquo;|&rdquo;|“|”/)
    expect(combined).not.toMatch(/\d[\d,]*\s+(members|guests|attendees)/i)
  })

  it('does not introduce remote image hosts on the homepage', () => {
    expect(content).not.toMatch(/src=["']https?:\/\//)
    expect(copy).not.toMatch(/imageSrc:\s*['"]https?:\/\//)
  })
})
