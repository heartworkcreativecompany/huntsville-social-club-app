/** Membership application intake copy and option lists. */

export const APPLICATION_FORM_INTRO =
  'A selective, trust-gated intake for Huntsville Social Club. Save anytime and return when you are ready to submit.'

export const APPLICATION_FORM_STEPS = [
  { id: 1, title: 'Profile basics' },
  { id: 2, title: 'Location' },
  { id: 3, title: 'Work & interests' },
  { id: 4, title: 'Short prompts' },
  { id: 5, title: 'Photos' },
  { id: 6, title: 'Agreements' },
] as const

export const APPLICATION_TOTAL_STEPS = APPLICATION_FORM_STEPS.length

export const PROMPT_MAX_CHARS = 250
export const PROMPT_MIN_REQUIRED = 2

export const PHOTO_MIN_COUNT = 2
export const PHOTO_MAX_COUNT = 6

export const INTEREST_MIN = 3
export const INTEREST_MAX = 6

export const GENDER_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
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

export const APPLICATION_PROMPTS = [
  {
    key: 'perfectWeekend' as const,
    label: 'A perfect weekend in Huntsville looks like…',
    placeholder: 'Farmers market, live music, a long walk at Monte Sano…',
  },
  {
    key: 'hopingToMeet' as const,
    label: 'I’m hoping to meet people who…',
    placeholder: 'Are curious, show up consistently, enjoy good conversation…',
  },
  {
    key: 'intoLately' as const,
    label: 'A few things I’m into lately…',
    placeholder: 'Trail running, local coffee spots, board game nights…',
  },
  {
    key: 'valueInCommunity' as const,
    label: 'One thing I value in a community is…',
    placeholder: 'Kindness, follow-through, showing up for each other…',
  },
] as const

export const AGREEMENT_ITEMS = [
  {
    key: 'codeOfConduct' as const,
    label: 'I agree to the Code of Conduct',
  },
  {
    key: 'informationAccurate' as const,
    label: 'I confirm the information I provided is accurate',
  },
  {
    key: 'approvalRequired' as const,
    label:
      'I understand approval is required before my profile goes live',
  },
  {
    key: 'verificationConsent' as const,
    label: 'I consent to verification review of my application',
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
