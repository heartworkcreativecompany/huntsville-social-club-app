import { PRICING_PLANS } from '@/lib/membership-pricing-copy'

/** Public homepage primary CTA. Routes to account creation, then the application. */
export const APPLY_FOR_FREE_MEMBERSHIP_CTA = 'Apply for free membership'
export const APPLY_FOR_MEMBERSHIP_CTA = 'Apply for Membership'
export const HOME_HEADER_SIGN_IN = 'Sign In'
export const HOME_HEADER_JOIN_CTA = 'Join the Club'

export const PUBLIC_SIGNUP_PATH = '/signup' as const
export const PUBLIC_LOGIN_PATH = '/login' as const
export const PUBLIC_PRICING_PATH = '/pricing' as const

export const HOME_HERO_IMAGE_SRC = '/brand/hsc-hero-lounge-abstract-responsive.png'
export const HOME_HERO_IMAGE_ALT =
  'Dark private-club lounge with a copy-safe wall, velvet seating, and a large abstract painting'

export const HOME_HERO_EYEBROW = 'Huntsville, Alabama'
export const HOME_HERO_HEADLINE = 'Where Huntsville Connects'
export const HOME_HERO_BODY =
  'Join the Huntsville Social Club to meet people through thoughtful gatherings, local experiences, and plans worth getting out for. Optional paid tiers offer added benefits and savings on eligible event attendance.'
export const HOME_HERO_SUPPORT_LINE_PRIMARY = 'Free to apply.'
export const HOME_HERO_SUPPORT_LINE_SECONDARY =
  'Optional paid tiers for added benefits and savings are available after approval.'

export const SOCIAL_INTRO_HEADLINE =
  'See what a more connected Huntsville can feel like.'
export const SOCIAL_INTRO_SUPPORTING =
  'A short intro video is coming soon.'

export const WHY_EXISTS_HEADLINE =
  'Huntsville is growing. Connection should grow with it.'
export const WHY_EXISTS_INTRO =
  'Huntsville is full of interesting people, places, and ideas. But adulthood, busy schedules, new moves, and scattered social circles can make it surprisingly hard to turn proximity into real connection.'

export const WHY_EXISTS_CARDS = [
  {
    challenge:
      'It can be hard to meet new people outside work, school, or an existing friend group.',
    response:
      'We create approachable reasons to show up, with shared experiences that make conversation feel natural.',
  },
  {
    challenge:
      'People want to explore Huntsville but do not always want to do it alone.',
    response:
      'We turn local places, creative ideas, and everyday plans into shared experiences.',
  },
  {
    challenge: 'One-off events rarely become lasting community.',
    response:
      'The club creates repeat opportunities to see familiar faces, follow up, and build momentum over time.',
  },
] as const

export const IMPLIED_EXPERIENCES_HEADLINE = 'The kinds of plans we make'
export const IMPLIED_EXPERIENCES_INTRO =
  'Gatherings are for members. Here is the spirit of what we get together for — not a public calendar.'

export const IMPLIED_EXPERIENCES = [
  {
    title: 'Dinner and drinks',
    description: 'Dinner and drinks at local spots.',
    imageSrc: '/brand/hsc-scene-dinner.jpg',
    imageAlt: 'A warmly lit dinner table set for a small group',
  },
  {
    title: 'Easy daytime plans',
    description: 'Coffee, brunch, and easy daytime plans.',
    imageSrc: '/brand/hsc-huntsville.jpg',
    imageAlt: 'Daytime view of Huntsville',
  },
  {
    title: 'Make and try',
    description: 'Creative workshops and local experiences.',
    imageSrc: '/brand/hsc-event-wine.jpg',
    imageAlt: 'Wine glasses on a table during a gathering',
  },
  {
    title: 'Culture and nights out',
    description: 'Culture, live events, and things worth trying together.',
    imageSrc: '/brand/hsc-event-rooftop.jpg',
    imageAlt: 'Evening rooftop seating with city lights',
  },
  {
    title: 'Outdoors and wellness',
    description: 'Outdoors, wellness, and active gatherings.',
    imageSrc: '/brand/hsc-event-hike.jpeg',
    imageAlt: 'An outdoor trail through trees',
  },
  {
    title: 'Member-led plans',
    description: 'Member-led plans around shared interests.',
    imageSrc: '/brand/hsc-scene-rooftop.jpg',
    imageAlt: 'Lounge seating on a rooftop terrace',
  },
  {
    title: 'Small-group moments',
    description:
      'Small-group moments that can turn into real friendships.',
    imageSrc: '/brand/hsc-hero-lounge.jpg',
    imageAlt: 'A lounge interior with velvet seating and warm lighting',
  },
] as const

export const MEMBERSHIP_VALUE_HEADLINE =
  'Start free. Upgrade when it fits your life.'
export const MEMBERSHIP_VALUE_BODY =
  'Start with free membership and get to know the community. Optional paid tiers are available for members who want added benefits and savings on eligible event attendance.'
export const MEMBERSHIP_VALUE_DETAILS_LABEL = 'See membership details'

/** Verified public names and prices only — full benefits live on /pricing. */
export const HOME_MEMBERSHIP_TIERS = [
  {
    name: PRICING_PLANS.member.name,
    price: PRICING_PLANS.member.price,
    optionalPaid: false,
    summary: PRICING_PLANS.member.description,
  },
  {
    name: PRICING_PLANS.connect.name,
    price: PRICING_PLANS.connect.price,
    optionalPaid: true,
    summary: PRICING_PLANS.connect.description,
  },
  {
    name: PRICING_PLANS.inner_circle.name,
    price: PRICING_PLANS.inner_circle.price,
    optionalPaid: true,
    summary: PRICING_PLANS.inner_circle.description,
  },
  {
    name: PRICING_PLANS.elite_circle.name,
    price: PRICING_PLANS.elite_circle.price,
    optionalPaid: true,
    summary: PRICING_PLANS.elite_circle.description,
  },
] as const

export const HOW_MEMBERSHIP_WORKS_HEADLINE = 'Joining is simple.'
export const HOW_MEMBERSHIP_WORKS_STEPS = [
  'Create your account.',
  'Tell us a little about yourself through a short membership application.',
  'We review every application thoughtfully.',
  'Once approved, start connecting and join in when a gathering feels right.',
] as const

export const WHO_IT_IS_FOR_HEADLINE = 'You’ll probably feel at home here if you…'
export const WHO_IT_IS_FOR_ITEMS = [
  'Want more meaningful ways to meet people in Huntsville.',
  'Are open to trying new places and saying yes to plans.',
  'Value kindness, curiosity, and showing up for others.',
  'Want a welcoming community without forced networking.',
  'Are new to Huntsville, in a new season of life, or ready to expand your circle.',
] as const

export const FOUNDER_NOTE_PLACEHOLDER_EYEBROW = 'A note from the founder'
export const FOUNDER_NOTE_PLACEHOLDER_HEADLINE = 'Coming later'
export const FOUNDER_NOTE_PLACEHOLDER_BODY =
  'This space is reserved for a future founder note or member stories. Nothing here is a testimonial yet.'

export const FINAL_CTA_HEADLINE =
  'Your next connection could start with one hello.'
export const FINAL_CTA_BODY =
  'Create an account, submit your membership application, and take the first step toward a more connected Huntsville.'
export const FINAL_CTA_REASSURANCE = 'Free to apply. Thoughtful review. No pressure.'
