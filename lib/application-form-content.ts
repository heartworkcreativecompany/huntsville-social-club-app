/** Membership application intake copy and option lists. */

export const APPLICATION_PAGE_INTRO =
  'Tell us about yourself. Be sure to save your answers along the way if you need to come back to finish. Once submitted, we will manually review your answers to confirm you are ready to join the club.'

export const APPLICATION_PAGE_SUBMITTED_INTRO =
  'Review what you submitted. Track verification and review progress on your status page.'

export const APPLICATION_REVIEW_PREVIEW_NOTICE =
  'Your profile will stay private until your identity has been verified and membership is approved. Review your public facing profile preview below. This is how other members will see you in the directory.'

export const APPLICATION_FORM_INTRO =
  'We only accept real people that have been verified by our administrative staff. Provide only accurate information that can be verified or your application will be rejected or returned for changes. Fields marked as required must be complete before submission. Optional fields do not block approval if left empty, but they do help your profile stand out to future connections.'

export const APPLICATION_FORM_STEPS = [
  { id: 1, title: 'Profile basics' },
  { id: 2, title: 'Location' },
  { id: 3, title: 'Work & interests' },
  { id: 4, title: 'About you' },
  { id: 5, title: 'Photos' },
  { id: 6, title: 'Review' },
] as const

export type ApplicationFormStepId = (typeof APPLICATION_FORM_STEPS)[number]['id']

export const APPLICATION_TOTAL_STEPS = APPLICATION_FORM_STEPS.length

export function applicationStepTitle(stepId: number): string {
  return (
    APPLICATION_FORM_STEPS.find((step) => step.id === stepId)?.title ??
    'Application'
  )
}

export function applicationStepHeadingId(stepId: number): string {
  return `application-step-${stepId}`
}

/** Prefix for final-step errors that originated on an earlier step. */
export function applicationGoBackToStepPrefix(stepId: number): string {
  return `Go back to Step ${stepId}: ${applicationStepTitle(stepId)}`
}

export const PROMPT_MAX_CHARS = 250

/** Required short-answer prompts for submit. */
export const REQUIRED_PROMPT_KEYS = ['bringsYouHere', 'hopingToMeet'] as const

export const PHOTO_MIN_COUNT = 2
export const PHOTO_MAX_COUNT = 6

export const INTEREST_MIN = 3
export const INTEREST_MAX = 6

export const GENDER_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'woman', label: 'Female' },
  { value: 'man', label: 'Male' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'other', label: 'Another identity' },
] as const

export const INTEREST_OPTIONS = [
  'Arts & culture',
  'Food & dining',
  'Outdoors & fitness',
  'Music & nightlife',
  'Professional networking',
  'Family & parenting',
  'Volunteering & civic life',
  'Books & learning',
  'Wellness',
  'Sports',
  'Tech & startups',
  'Faith & fellowship',
  'Games & hobbies',
  'Travel',
  'Photography',
] as const

export const LIFESTYLE_TAG_OPTIONS = [
  'Early riser',
  'Night owl',
  'Pet parent',
  'New to Huntsville',
  'Longtime local',
  'Remote worker',
  'Frequent host',
  'Low-key social',
] as const

export const EVENT_INTEREST_OPTIONS = [
  'Small dinners',
  'Coffee meetups',
  'Outdoor adventures',
  'Cultural outings',
  'Professional mixers',
  'Family-friendly events',
  'Members-only gatherings',
] as const

/** Shared helper for the two required About you prompts that stay off the public profile. */
export const APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE =
  'These answers are for internal review only and are not shown on your public profile.'

export const APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE_ID =
  'application-internal-review-prompts-notice'

export const APPLICATION_PROMPTS = [
  {
    key: 'bringsYouHere' as const,
    label: 'What brings you to the club most right now?',
    placeholder:
      'A fresh social circle, thoughtful events, professional peers outside work…',
    required: true,
    profileVisible: false,
  },
  {
    key: 'hopingToMeet' as const,
    label: 'What kind of connections are you open to?',
    placeholder:
      'Curious people who show up, low-pressure hangs, activity partners…',
    required: true,
    profileVisible: false,
  },
  {
    key: 'perfectWeekend' as const,
    label: 'A perfect weekend in Huntsville looks like…',
    placeholder: 'Farmers market, live music, a long walk at Monte Sano…',
    required: false,
    profileVisible: true,
  },
  {
    key: 'favoriteLocalActivities' as const,
    label: 'Favorite local activities or spots',
    placeholder: 'Trail runs, downtown coffee, trivia nights, Lowe Mill…',
    required: false,
    profileVisible: true,
  },
  {
    key: 'icebreaker' as const,
    label: 'A quick icebreaker about you',
    placeholder: 'Always down for a good bookstore or a new taco spot.',
    required: false,
    profileVisible: true,
  },
] as const

export const AGREEMENT_ITEMS = [
  {
    key: 'codeOfConduct' as const,
    label: 'I agree to the Code of Conduct',
    required: true,
  },
  {
    key: 'informationAccurate' as const,
    label: 'I confirm the information I provided is accurate',
    required: true,
  },
  {
    key: 'approvalRequired' as const,
    label:
      'I understand approval is required before my profile goes live',
    required: true,
  },
  {
    key: 'verificationConsent' as const,
    label: 'I consent to verification review of my application',
    required: true,
  },
] as const

export const US_STATE_OPTIONS = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
] as const
