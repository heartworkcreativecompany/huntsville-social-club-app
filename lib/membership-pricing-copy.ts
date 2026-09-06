import {
  ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD,
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'

export const PRICING_HEADLINE = 'Memberships designed for how social you want to be'

export const PRICING_SUBHEADLINE =
  'Join the Huntsville Social Club as a free member, add messaging with Connect, unlock curated matches with Inner Circle, or go all in with Elite Circle'

export const PRICING_SUPPORTING_LINE =
  'All memberships begin with approval. Upgrade anytime for messaging, curated matches, Circle Socials, premium credits, and more ways to connect.'

export const CONNECT_MONTHLY_PRICE = '$9.99/month'
export const INNER_CIRCLE_MONTHLY_PRICE = '$29.99/month'
export const ELITE_CIRCLE_MONTHLY_PRICE = '$69.99/month'

export const PRICING_PLANS = {
  member: {
    name: 'Member',
    price: 'Free',
    description: 'Explore the club at your pace',
    bullets: [
      'Browse approved member profiles',
      'Browse the Business Directory',
      'Free standard events',
      'Paid Circle Socials and premium events',
      'No messaging',
      'No curated matching',
      'No Business Directory listing application',
    ],
    cta: 'Join Free',
  },
  connect: {
    name: 'Connect',
    price: CONNECT_MONTHLY_PRICE,
    description: 'Self-directed messaging and member discovery',
    bullets: [
      'Everything in Member',
      'Send and receive direct messages',
      'Browse approved member profiles with search and filters',
      'Free standard events',
      'Paid Circle Socials and premium events',
      'Connect badge',
    ],
    cta: 'Join Connect',
  },
  inner_circle: {
    name: 'Inner Circle',
    price: INNER_CIRCLE_MONTHLY_PRICE,
    description: 'Messaging, curated matches, Circle Socials, and premium event credits',
    badge: 'Most Popular',
    bullets: [
      'Everything in Connect',
      'Dating and Friendship Compatibility Questionnaires',
      'Curated Dating Matches and Matched Friends',
      `${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} included premium event credit per billing period`,
      `${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle Social credits per billing period`,
      'Pay for additional premium events anytime',
      'Create standard events (admin approval required)',
      'Inner Circle badge',
    ],
    cta: 'Join Inner Circle',
  },
  elite_circle: {
    name: 'Elite Circle',
    price: ELITE_CIRCLE_MONTHLY_PRICE,
    description: 'The full club experience',
    bullets: [
      'Everything in Inner Circle',
      `${ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} included premium event credits per billing period`,
      'All Circle Socials are included in your membership.',
      `${ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD} guest invite per billing period`,
      'Priority RSVP for premium events and Circle Socials',
      'Eligible to apply for a Business Directory listing',
      'Elite Circle badge',
    ],
    cta: 'Join Elite Circle',
  },
} as const

export const COMPARISON_TABLE = {
  columns: ['Feature', 'Member', 'Connect', 'Inner Circle', 'Elite Circle'] as const,
  rows: [
    ['Approved membership', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Browse member profiles', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Browse Business Directory', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Apply for Business Directory listing', 'No', 'No', 'No', 'Yes'],
    ['Messaging', 'No', 'Yes', 'Yes', 'Yes'],
    ['Curated matching', 'No', 'No', 'Yes', 'Yes'],
    ['Standard events', 'Free', 'Free', 'Free + can create (admin approval)', 'Free + can create (admin approval)'],
    [
      'Circle Socials',
      'Paid',
      'Paid',
      `${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included credits per billing period`,
      'All Circle Socials are included in your membership.',
    ],
    [
      'Premium event credits',
      '0 (pay per event)',
      '0 (pay per event)',
      `${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} per billing period`,
      `${ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} per billing period`,
    ],
    ['Guest invites', 'No', 'No', 'No', `${ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD} per billing period`],
    ['Badge', 'No', 'Connect badge', 'Inner Circle badge', 'Elite Circle badge'],
  ] as const,
  footnote: `Inner Circle includes ${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium event credit and ${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} Circle Social credits per billing period. Elite includes ${ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium credits, ${ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD} guest invite, priority RSVP, and all Circle Socials in your membership.`,
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
      'Yes. Free members attend standard events at no charge. Circle Socials and premium events are available to free members by paying the event fee.',
  },
  {
    question: 'What is included with Connect?',
    answer: `Connect (${CONNECT_MONTHLY_PRICE}) includes messaging and member discovery. You can browse approved live profiles, use search and filters, send and receive direct messages, attend standard events free, and purchase Circle Social and premium event admission. Curated matching, event credits, and event creation are Inner Circle and Elite Circle benefits.`,
  },
  {
    question: 'What is included with Inner Circle?',
    answer: `Inner Circle (${INNER_CIRCLE_MONTHLY_PRICE}) includes messaging, Dating and Friendship Compatibility Questionnaires, curated matches, ${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} included premium event credit per billing period, ${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle Social credits per billing period, and the ability to create standard events subject to admin approval.`,
  },
  {
    question: 'Are Circle Socials counted toward premium credits?',
    answer: `No. Premium credits apply only to premium events. Inner Circle receives ${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle Social credits per billing period. Elite Circle includes all Circle Socials in the membership.`,
  },
  {
    question: 'What does Elite Circle include?',
    answer: `Elite Circle includes everything in Inner Circle, plus ${ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium event credits per billing period, ${ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD} guest invite, priority RSVP for premium events and Circle Socials, eligibility to apply for a Business Directory listing, and all Circle Socials included in your membership.`,
  },
  {
    question: 'Can I change my membership later?',
    answer:
      'Yes. You can upgrade your membership as your level of involvement changes. Billing and access update based on your active plan.',
  },
  {
    question: 'Is there annual pricing?',
    answer: 'Not yet. Memberships are currently offered on a monthly basis only.',
  },
] as const

export const BOTTOM_CTA = {
  headline: 'Find the membership that fits your social life',
  subtext:
    'Start free, add messaging with Connect, unlock curated matches with Inner Circle, or go all in with Elite Circle',
  ctas: {
    member: 'Join Free',
    connect: 'Join Connect',
    inner_circle: 'Join Inner Circle',
    elite_circle: 'Join Elite Circle',
  },
} as const

export const UPGRADE_MODALS = {
  free_to_inner: {
    title: 'Unlock more with Inner Circle',
    body: `Get messaging, ${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} included premium event credit per billing period, and ${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle Social credits per billing period.`,
    bullets: [
      'Message other approved members',
      `${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} included premium event credit per billing period`,
      `${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle Social credits per billing period`,
      'Create standard events with admin approval',
    ],
    primaryCta: 'Join Inner Circle',
    secondaryCta: 'Maybe Later',
  },
  free_to_elite: {
    title: 'Go all in with Elite Circle',
    body: 'Get the highest level of access with premium credits, guest invites, priority RSVP, and Business Directory eligibility.',
    bullets: [
      `${ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium event credits per billing period`,
      'All Circle Socials are included in your membership.',
      `${ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD} guest invite per billing period`,
      'Priority RSVP for premium events and Circle Socials',
      'Apply for a Business Directory listing',
    ],
    primaryCta: 'Join Elite Circle',
    secondaryCta: 'Maybe Later',
  },
  inner_to_elite: {
    title: 'Upgrade to Elite Circle',
    body: 'Move up to more premium credits, a guest invite, priority RSVP, and Business Directory eligibility.',
    bullets: [
      `${ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} premium event credits per billing period`,
      'All Circle Socials are included in your membership.',
      `${ELITE_CIRCLE_GUEST_INVITES_PER_PERIOD} guest invite per billing period`,
      'Priority RSVP',
      'Business Directory listing eligibility',
    ],
    primaryCta: 'Upgrade to Elite Circle',
    secondaryCta: 'Keep Inner Circle',
  },
} as const

export type UpgradeModalVariant = keyof typeof UPGRADE_MODALS

export const FEATURE_GATE_COPY = {
  messaging: {
    title: 'Messaging is available with a paid membership',
    body: 'Upgrade to Connect, Inner Circle, or Elite Circle to message other approved members and connect beyond events.',
    primaryCta: 'Unlock Messaging',
    secondaryCta: 'View Memberships',
    inline: 'Upgrade to Connect, Inner Circle, or Elite Circle to send messages.',
  },
  business_directory_apply: {
    title: 'Business Directory listings are for Elite Circle',
    body: 'Upgrade to Elite Circle to apply for a Business Directory listing. All members can browse approved listings.',
    primaryCta: 'Join Elite Circle',
    secondaryCta: 'Browse Directory',
    inline: 'Only Elite Circle members can apply for a Business Directory listing.',
  },
  inner_included_remaining: {
    supportingLine:
      'Use one of your included premium event credits for this event, or save it for another upcoming event.',
    primaryCta: 'Use Premium Credit',
    secondaryCta: 'Pay Instead',
  },
  inner_included_exhausted: {
    title: `You've used all ${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} included premium event credit for this billing period`,
    body: 'You can still register for this premium event by paying the event fee, or upgrade to Elite Circle for more included credits.',
    primaryCta: 'Pay for This Event',
    secondaryCta: 'Upgrade to Elite Circle',
    inline: `You've used your included premium event credit this billing period. You can still attend by paying the event fee.`,
  },
} as const

export const ELITE_CIRCLE_SOCIALS_INCLUDED_COPY =
  'All Circle Socials are included in your membership.'

export const INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE = `You have used your ${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle Social credits for this billing period.`

/** Singular when remaining is 1; plural for 0 or any other count. */
export function includedCreditNoun(remaining: number): string {
  return remaining === 1 ? 'credit' : 'credits'
}

export function innerIncludedRemainingHeadline(remaining: number): string {
  return `You have ${remaining} of ${INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD} included premium event ${includedCreditNoun(remaining)} remaining this billing period.`
}

export function elitePremiumRemainingHeadline(
  remaining: number,
  granted: number = ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
): string {
  return `You have ${remaining} of ${granted} included premium event credits remaining this billing period`
}

export function innerCircleSocialRemainingHeadline(remaining: number): string {
  return `You have ${remaining} of ${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle Social ${includedCreditNoun(remaining)} remaining this billing period.`
}

export function innerIncludedSummary(remaining: number): string {
  if (remaining <= 0) {
    return FEATURE_GATE_COPY.inner_included_exhausted.inline
  }
  return innerIncludedRemainingHeadline(remaining)
}

export function eliteUnlimitedSummary(): string {
  return elitePremiumRemainingHeadline(ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD)
}

export function memberFreeSummary(): string {
  return 'Standard events are free. Circle Socials and premium events require payment. Upgrade for messaging, Circle Social credits, and premium event credits.'
}

/** MembershipUsageCard copy for free / no-subscription members (no credit counts). */
export const FREE_MEMBER_PREMIUM_CREDITS_COPY =
  'Premium event credits are included with Inner Circle and Elite Circle memberships.'

