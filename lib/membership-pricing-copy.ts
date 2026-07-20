import { INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD } from '@/lib/membership-tier-config'

export const PRICING_HEADLINE = 'Memberships designed for how social you want to be'

export const PRICING_SUBHEADLINE =
  'Join the Huntsville Social Club as a free member, unlock more with Inner Circle, or go all in with Elite Circle'

export const PRICING_SUPPORTING_LINE =
  'All memberships begin with approval. Upgrade anytime for more access, more events, and more ways to connect.'

export const INNER_CIRCLE_MONTHLY_PRICE = '$39/month'
export const ELITE_CIRCLE_MONTHLY_PRICE = '$89/month'

export const PRICING_PLANS = {
  member: {
    name: 'Member',
    price: 'Free',
    description: 'Explore the club at your pace',
    bullets: [
      'Browse approved member profiles',
      'View upcoming standard events',
      'Pay in advance for standard event attendance',
      'No messaging',
      'No access to Circle Socials',
    ],
    cta: 'Join Free',
  },
  inner_circle: {
    name: 'Inner Circle',
    price: INNER_CIRCLE_MONTHLY_PRICE,
    description: 'More access, more connection, more ways to show up',
    badge: 'Most Popular',
    bullets: [
      'Everything in Member',
      'Messaging access',
      `${INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD} included standard event registrations per billing period`,
      'Access to Circle Socials',
      'Circle Socials included at no additional cost',
      'Inner Circle badge',
      'Additional standard events can still be purchased after the 3 included registrations are used',
    ],
    cta: 'Join Inner Circle',
  },
  elite_circle: {
    name: 'Elite Circle',
    price: ELITE_CIRCLE_MONTHLY_PRICE,
    description: 'The full club experience',
    bullets: [
      'Everything in Inner Circle',
      'Unlimited included standard event registrations',
      'Access to Circle Socials',
      'Circle Socials included at no additional cost',
      'Messaging access',
      'Elite Circle badge',
      'Future premium perks such as priority access, guest benefits, and concierge-style experiences',
    ],
    cta: 'Join Elite Circle',
  },
} as const

export const COMPARISON_TABLE = {
  columns: ['Feature', 'Member', 'Inner Circle', 'Elite Circle'] as const,
  rows: [
    ['Approved membership', 'Yes', 'Yes', 'Yes'],
    ['Browse member profiles', 'Yes', 'Yes', 'Yes'],
    ['Messaging', 'No', 'Yes', 'Yes'],
    [
      'Standard events',
      'Pay in advance',
      '3 included per billing period, then pay per additional event',
      'Unlimited included',
    ],
    ['Circle Socials', 'No access', 'Included', 'Included'],
    [
      'Included standard event registrations',
      '0',
      `${INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD} per billing period`,
      'Unlimited',
    ],
    [
      'Additional standard event purchases',
      'Yes',
      'Yes',
      'Not usually needed',
    ],
    ['Badge', 'No', 'Inner Circle badge', 'Elite Circle badge'],
    ['Premium perks', 'No', 'Limited', 'Yes'],
  ] as const,
  footnote: `Inner Circle includes ${INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD} standard event registrations per billing period. Circle Socials are included for Inner Circle and Elite Circle members at no additional cost.`,
}

export const PRICING_FAQ = [
  {
    question: 'Do I need to be approved before joining?',
    answer:
      'Yes. Huntsville Social Club is a curated membership community, and all memberships begin with approval.',
  },
  {
    question: 'Can free members attend events?',
    answer:
      'Yes. Free members can attend eligible standard events by paying in advance. Circle Socials are not available on the free plan.',
  },
  {
    question: 'What is included with Inner Circle?',
    answer:
      'Inner Circle includes messaging, access to Circle Socials, and 3 included standard event registrations per billing period. After those 3 included registrations are used, you can still attend additional standard events by paying in advance.',
  },
  {
    question: 'Are Circle Socials counted toward the 3 included registrations?',
    answer:
      'No. Circle Socials are included at no additional cost for Inner Circle and Elite Circle members.',
  },
  {
    question: 'What happens when I use all 3 included standard event registrations?',
    answer:
      'You can still register for additional standard events by paying in advance, or upgrade to Elite Circle for unlimited included standard event registrations.',
  },
  {
    question: 'What does Elite Circle include?',
    answer:
      'Elite Circle includes everything in Inner Circle, plus unlimited included standard event registrations and the highest level of club access.',
  },
  {
    question: 'Can I change my membership later?',
    answer:
      'Yes. You can upgrade your membership as your level of involvement changes. Billing and access should update based on your active plan.',
  },
  {
    question: 'Is there annual pricing?',
    answer: 'Not yet. Memberships are currently offered on a monthly basis only.',
  },
] as const

export const BOTTOM_CTA = {
  headline: 'Find the membership that fits your social life',
  subtext:
    'Start free, unlock more with Inner Circle, or go all in with Elite Circle',
  ctas: {
    member: 'Join Free',
    inner_circle: 'Join Inner Circle',
    elite_circle: 'Join Elite Circle',
  },
} as const

export const UPGRADE_MODALS = {
  free_to_inner: {
    title: 'Unlock more with Inner Circle',
    body: 'Get messaging, access to Circle Socials, and 3 included standard event registrations every billing period.',
    bullets: [
      'Message other approved members',
      'Attend Circle Socials at no additional cost',
      'Use 3 included standard event registrations each billing period',
      'Purchase additional standard events anytime',
    ],
    primaryCta: 'Join Inner Circle',
    secondaryCta: 'Maybe Later',
  },
  free_to_elite: {
    title: 'Go all in with Elite Circle',
    body: 'Get the highest level of access with unlimited included standard events, Circle Socials, and premium member perks.',
    bullets: [
      'Unlimited included standard event registrations',
      'Circle Socials included',
      'Messaging access',
      'Elite Circle status',
    ],
    primaryCta: 'Join Elite Circle',
    secondaryCta: 'Maybe Later',
  },
  inner_to_elite: {
    title: 'Upgrade to Elite Circle',
    body: 'Move from included access to unlimited access and unlock the highest level of membership.',
    bullets: [
      'Unlimited included standard event registrations',
      'Circle Socials included',
      'Elite Circle badge',
      'Premium perks as they roll out',
    ],
    primaryCta: 'Upgrade to Elite Circle',
    secondaryCta: 'Keep Inner Circle',
  },
} as const

export type UpgradeModalVariant = keyof typeof UPGRADE_MODALS

export const FEATURE_GATE_COPY = {
  messaging: {
    title: 'Messaging is available with paid membership',
    body: 'Upgrade to Inner Circle or Elite Circle to message other approved members and connect beyond events.',
    primaryCta: 'Unlock Messaging',
    secondaryCta: 'View Memberships',
    inline:
      'Upgrade to Inner Circle or Elite Circle to send messages.',
  },
  circle_social: {
    title: 'Circle Socials are for paid members',
    body: 'Upgrade to Inner Circle or Elite Circle to attend Circle Socials at no additional cost.',
    primaryCta: 'Unlock Circle Socials',
    secondaryCta: 'View Memberships',
    inline:
      'Circle Socials are included with Inner Circle and Elite Circle.',
  },
  inner_included_remaining: {
    supportingLine:
      'Use one of your included registrations for this event, or save it for another upcoming event.',
    primaryCta: 'Use Included Registration',
    secondaryCta: 'Pay Instead',
  },
  inner_included_exhausted: {
    title: `You've used all ${INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD} included standard event registrations for this billing period`,
    body: 'You can still register for this event by paying in advance, or upgrade to Elite Circle for unlimited included standard events.',
    primaryCta: 'Pay for This Event',
    secondaryCta: 'Upgrade to Elite Circle',
    inline: `You've used all ${INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD} included standard event registrations this billing period. You can still attend by paying in advance.`,
  },
} as const

export function innerIncludedRemainingHeadline(remaining: number): string {
  return `You have ${remaining} of ${INNER_CIRCLE_FREE_REGISTRATIONS_PER_PERIOD} included standard event registrations remaining this billing period`
}

export function innerIncludedSummary(remaining: number): string {
  if (remaining <= 0) {
    return FEATURE_GATE_COPY.inner_included_exhausted.inline
  }
  return innerIncludedRemainingHeadline(remaining)
}

export function eliteUnlimitedSummary(): string {
  return 'Unlimited included standard event registrations'
}

export function memberFreeSummary(): string {
  return 'Pay in advance for standard event attendance. Upgrade to Inner Circle or Elite Circle for curated matches, curated intros, messaging, and Circle Social access.'
}
