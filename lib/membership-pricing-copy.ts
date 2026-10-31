import { NEW_PURCHASE_OFFERS_ACTIVE } from '@/lib/circle-benefit-packages'
import {
  ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
  INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD,
  INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD,
} from '@/lib/membership-tier-config'

export const PRICING_HEADLINE = 'Memberships designed for how social you want to be'

export const PRICING_SUBHEADLINE =
  'Join as a free member, unlock curated matches with Inner Circle, or go all in with Elite Circle. Messaging requires approval and accepted identity.'

export const PRICING_SUPPORTING_LINE =
  'All memberships begin with approval. Messaging requires accepted identity. Inner Circle adds compatibility recommendations. Elite Circle adds Circle Social credits, a premium-event credit, priority RSVP, and Business Directory application eligibility.'

export const CONNECT_MONTHLY_PRICE = '$9.99/month'

/** Current Connect account copy. Not a new-purchase offer. */
export const CONNECT_MEMBERSHIP_INCLUDED_COPY =
  'Your Connect plan includes member discovery. Messaging is included after approval and identity verification. Dating and friendship recommendations are not part of Connect.'

/** Connect subscription that is not an active paid entitlement. Messaging is unchanged. */
export const CONNECT_DISCOVERY_WITHOUT_MESSAGING_COPY =
  'Your Connect subscription is not currently active for member discovery. Messaging still requires approval and verified identity.'
export const INNER_CIRCLE_MONTHLY_PRICE = '$15.99/month'
export const ELITE_CIRCLE_MONTHLY_PRICE = '$39.99/month'

export const DATING_RECOMMENDATIONS_COPY =
  'Compatibility-based dating recommendations.'
export const DATING_AND_FRIENDSHIP_RECOMMENDATIONS_COPY =
  'Compatibility-based dating and friendship recommendations.'

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
      'Message approved members after identity verification',
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
    description:
      'Compatibility-based dating recommendations. No Circle Social credits, premium-event credits, or guest invitations.',
    badge: 'Most Popular',
    bullets: [
      DATING_RECOMMENDATIONS_COPY,
      'Intentional messaging after membership approval and identity verification.',
      'No Circle Social credits.',
      'No premium-event credits.',
      'No guest invitations.',
    ],
    cta: 'Join Inner Circle',
  },
  elite_circle: {
    name: 'Elite Circle',
    price: ELITE_CIRCLE_MONTHLY_PRICE,
    description:
      'Everything in Inner Circle, plus 2 Circle Social credits and 1 premium-event credit per billing cycle, priority RSVP, and Business Directory application eligibility. No guest invitations.',
    bullets: [
      'Everything in Inner Circle.',
      '2 Circle Social credits per billing cycle.',
      '1 premium-event credit per billing cycle.',
      'Priority RSVP.',
      'Business Directory application eligibility.',
      'No guest invitations.',
    ],
    cta: 'Join Elite Circle',
  },
} as const

export const COMPARISON_TABLE = {
  columns: ['Feature', 'Member', 'Inner Circle', 'Elite Circle'] as const,
  rows: [
    ['Approved membership', 'Yes', 'Yes', 'Yes'],
    ['Browse member profiles', 'Yes', 'Yes', 'Yes'],
    ['Browse Business Directory', 'Yes', 'Yes', 'Yes'],
    ['Apply for Business Directory listing', 'No', 'No', 'Yes'],
    [
      'Messaging',
      'After approval and identity verification',
      'Included after approval and identity verification',
      'Included after approval and identity verification',
    ],
    ['Curated matching', 'No', 'Yes', 'Yes'],
    ['Standard events', 'Free', 'Free + can create (admin approval)', 'Free + can create (admin approval)'],
    [
      'Circle Socials',
      'Paid',
      'No included credits',
      '2 credits per billing cycle',
    ],
    [
      'Premium event credits',
      '0 (pay per event)',
      'No included credits',
      '1 per billing cycle',
    ],
    ['Guest invites', 'No', 'No', 'No'],
    ['Priority RSVP', 'No', 'No', 'Yes'],
    ['Badge', 'No', 'Inner Circle badge', 'Elite Circle badge'],
  ] as const,
  footnote:
    'New Inner Circle memberships are $15.99/month and include compatibility recommendations, with no Circle Social credits, premium-event credits, or guest invitations. New Elite Circle memberships are $39.99/month and include 2 Circle Social credits, 1 premium-event credit, priority RSVP, and Business Directory application eligibility, with no guest invitations. Existing subscriptions keep the price and benefits already issued for the current billing period.',
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
    question: 'Is Connect available for new memberships?',
    answer:
      'No. Connect is not offered for new purchase. Existing Connect subscriptions continue and can be managed or changed to Inner Circle or Elite Circle in billing. Messaging requires approval and accepted identity on every plan.',
  },
  {
    question: 'What is included with Inner Circle?',
    answer: `Inner Circle (${INNER_CIRCLE_MONTHLY_PRICE}) includes ${DATING_RECOMMENDATIONS_COPY} It includes no Circle Social credits, no premium-event credits, and no guest invitations. Intentional messaging is available after membership approval and identity verification. A paid membership does not grant or withhold messaging.`,
  },
  {
    question: 'Are Circle Socials counted toward premium credits?',
    answer:
      'No. Premium-event credits apply only to premium events. A new Inner Circle membership includes no Circle Social credits and no premium-event credits. A new Elite Circle membership includes 2 Circle Social credits and 1 premium-event credit per billing cycle. Existing subscriptions keep the benefits already issued for the current billing period.',
  },
  {
    question: 'What does Elite Circle include?',
    answer: `Elite Circle (${ELITE_CIRCLE_MONTHLY_PRICE}) includes everything in Inner Circle, plus 2 Circle Social credits per billing cycle, 1 premium-event credit per billing cycle, priority RSVP, and Business Directory application eligibility. It includes no guest invitations.`,
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
    'Start free, unlock curated matches with Inner Circle, or go all in with Elite Circle. Messaging requires approval and accepted identity.',
  ctas: {
    member: 'Join Free',
    inner_circle: 'Join Inner Circle',
    elite_circle: 'Join Elite Circle',
  },
} as const

export const UPGRADE_MODALS = {
  free_to_inner: {
    title: 'Join Inner Circle',
    body: `Inner Circle is ${INNER_CIRCLE_MONTHLY_PRICE}. ${DATING_RECOMMENDATIONS_COPY} It includes no Circle Social credits, no premium-event credits, and no guest invitations.`,
    bullets: [
      DATING_RECOMMENDATIONS_COPY,
      'Intentional messaging after membership approval and identity verification.',
      'No Circle Social credits.',
      'No premium-event credits.',
      'No guest invitations.',
    ],
    primaryCta: 'Join Inner Circle',
    secondaryCta: 'Maybe Later',
  },
  free_to_elite: {
    title: 'Join Elite Circle',
    body: `Elite Circle is ${ELITE_CIRCLE_MONTHLY_PRICE}. It includes everything in Inner Circle, plus 2 Circle Social credits and 1 premium-event credit per billing cycle, priority RSVP, and Business Directory application eligibility. No guest invitations.`,
    bullets: [
      'Everything in Inner Circle.',
      '2 Circle Social credits per billing cycle.',
      '1 premium-event credit per billing cycle.',
      'Priority RSVP.',
      'Business Directory application eligibility.',
      'No guest invitations.',
    ],
    primaryCta: 'Join Elite Circle',
    secondaryCta: 'Maybe Later',
  },
  inner_to_elite: {
    title: 'Upgrade to Elite Circle',
    body: `A new Elite Circle membership is ${ELITE_CIRCLE_MONTHLY_PRICE} and adds 2 Circle Social credits, 1 premium-event credit, priority RSVP, and Business Directory application eligibility. No guest invitations. An existing subscription keeps its current price until you change it.`,
    bullets: [
      '2 Circle Social credits per billing cycle.',
      '1 premium-event credit per billing cycle.',
      'Priority RSVP.',
      'Business Directory application eligibility.',
      'No guest invitations.',
    ],
    primaryCta: 'Upgrade to Elite Circle',
    secondaryCta: 'Keep Inner Circle',
  },
} as const

export type UpgradeModalVariant = keyof typeof UPGRADE_MODALS

export const FEATURE_GATE_COPY = {
  messaging: {
    title: 'Messaging requires approval and identity verification',
    body: 'Approved members can send message requests after identity verification. A paid membership does not grant or withhold messaging. Curated matching remains an Inner Circle and Elite Circle benefit.',
    primaryCta: 'Check identity verification',
    secondaryCta: 'View memberships',
    inline:
      'Messaging requires an approved membership and verified identity.',
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

/** Stored null premium grant. Not the numeric legacy or new-purchase allotment. */
export const UNMETERED_PREMIUM_EVENTS_COPY =
  'Premium events are included for this billing period.'

/** New-package subscription whose billing period has not been issued yet. */
export const PENDING_CIRCLE_ENTITLEMENT_COPY =
  'Included credits and guest invitations are pending until this billing period is confirmed.'

/** Circle subscription whose price is missing or not mapped to a package. */
export const UNAVAILABLE_CIRCLE_ENTITLEMENT_COPY =
  'Included credits and guest invitations are unavailable until this subscription is mapped to a benefit package.'

export const INNER_CIRCLE_SOCIAL_CREDITS_EXHAUSTED_MESSAGE = `You have used your ${INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD} included Circle Social credits for this billing period.`

/** Singular when remaining is 1; plural for 0 or any other count. */
export function includedCreditNoun(remaining: number): string {
  return remaining === 1 ? 'credit' : 'credits'
}

export function innerIncludedRemainingHeadline(
  remaining: number,
  granted: number = INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
): string {
  return `You have ${remaining} of ${granted} included premium event ${includedCreditNoun(remaining)} remaining this billing period.`
}

export function elitePremiumRemainingHeadline(
  remaining: number,
  granted: number = ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
): string {
  return `You have ${remaining} of ${granted} included premium event credits remaining this billing period`
}

export function innerCircleSocialRemainingHeadline(
  remaining: number,
  granted: number = INNER_CIRCLE_CIRCLE_SOCIAL_CREDITS_PER_PERIOD
): string {
  return `You have ${remaining} of ${granted} included Circle Social ${includedCreditNoun(remaining)} remaining this billing period.`
}

export function innerIncludedSummary(
  remaining: number,
  granted: number = INNER_CIRCLE_PREMIUM_CREDITS_PER_PERIOD
): string {
  if (granted <= 0) {
    return 'Premium events are paid per event on this membership.'
  }
  if (remaining <= 0) {
    return FEATURE_GATE_COPY.inner_included_exhausted.inline
  }
  return innerIncludedRemainingHeadline(remaining, granted)
}

export function eliteUnlimitedSummary(): string {
  return elitePremiumRemainingHeadline(ELITE_CIRCLE_PREMIUM_CREDITS_PER_PERIOD)
}

export function memberFreeSummary(): string {
  return 'Standard events are free. Circle Socials and premium events require payment. Messaging requires approval and identity verification. Curated matching and premium event credits stay with Inner Circle and Elite Circle.'
}

/** MembershipUsageCard copy for free / no-subscription members (no credit counts). */
export const FREE_MEMBER_PREMIUM_CREDITS_COPY =
  'Premium event credits are included with Inner Circle and Elite Circle memberships.'

/**
 * Public wording for the active new-purchase offers. Friendship appears only
 * when the caller passes the friendship feature flag.
 */
export function preparedNewPurchaseMembershipCopy(input: {
  friendshipMatchingEnabled: boolean
}): {
  active: boolean
  inner: { name: string; price: string; bullets: string[] }
  elite: { name: string; price: string; bullets: string[] }
  existingSubscription: string
  complimentary: string
  messaging: string
} {
  const recommendations = input.friendshipMatchingEnabled
    ? DATING_AND_FRIENDSHIP_RECOMMENDATIONS_COPY
    : DATING_RECOMMENDATIONS_COPY
  return {
    active: NEW_PURCHASE_OFFERS_ACTIVE,
    inner: {
      name: 'Inner Circle',
      price: '$15.99/month',
      bullets: [
        recommendations,
        'Intentional messaging after membership approval and identity verification.',
        'No Circle Social credits.',
        'No premium-event credits.',
        'No guest invitations.',
      ],
    },
    elite: {
      name: 'Elite Circle',
      price: '$39.99/month',
      bullets: [
        'Everything in Inner Circle.',
        '2 Circle Social credits per billing cycle.',
        '1 premium-event credit per billing cycle.',
        'Priority RSVP.',
        'Business Directory application eligibility.',
        'No guest invitations.',
      ],
    },
    existingSubscription:
      'Existing subscriptions keep their current price and the benefits already issued for the current billing period.',
    complimentary:
      'Complimentary access is separate from a new membership purchase and keeps the existing complimentary benefits.',
    messaging:
      'Intentional messaging is available to eligible members after membership approval and identity verification. A paid membership does not grant or withhold it.',
  }
}

