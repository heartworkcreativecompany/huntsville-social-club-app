export const COMPATIBILITY_QUESTIONNAIRE_VERSION = 2 as const

export type CompatibilityQuestionnaireSectionId =
  | 'eligibility'
  | 'values'
  | 'family'
  | 'lifestyle'

export type CompatibilityQuestionFieldType =
  | 'single'
  | 'multi'
  | 'text'
  | 'scale'
  | 'number'
  | 'age_range'

export type CompatibilityQuestionOption = {
  value: string | number
  label: string
}

export type CompatibilityQuestionDefinition = {
  id: string
  section: CompatibilityQuestionnaireSectionId
  prompt: string
  helperText?: string
  type: CompatibilityQuestionFieldType
  options?: CompatibilityQuestionOption[]
  required: boolean
  min?: number
  max?: number
  /** When set, this field is only shown when another field equals `value`. */
  visibleWhen?: { field: string; value: string }
  /** Multi-select option that cannot be combined with others. */
  exclusiveOption?: string
}

export type CompatibilityQuestionnaireSection = {
  id: CompatibilityQuestionnaireSectionId
  title: string
  description: string
}

export const COMPATIBILITY_QUESTIONNAIRE_SECTIONS: CompatibilityQuestionnaireSection[] =
  [
    {
      id: 'eligibility',
      title: 'Eligibility',
      description:
        'These answers determine who you can be matched with. They stay private and are never shown on your profile.',
    },
    {
      id: 'values',
      title: 'Values and intent',
      description:
        'Help us understand what you are looking for in a relationship and how you live day to day.',
    },
    {
      id: 'family',
      title: 'Family and relationship history',
      description:
        'These questions help us respect your family context and relationship preferences.',
    },
    {
      id: 'lifestyle',
      title: 'Lifestyle',
      description:
        'Rate how much you agree with each statement (1 = Strongly disagree, 5 = Strongly agree).',
    },
  ]

const ORDINAL_5 = (labels: string[]): CompatibilityQuestionOption[] =>
  labels.map((label, index) => ({ value: index + 1, label }))

const AGREE_DISAGREE_5 = ORDINAL_5([
  'Strongly disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly agree',
])

export const COMPATIBILITY_QUESTIONNAIRE_QUESTIONS: CompatibilityQuestionDefinition[] =
  [
    {
      id: 'age',
      section: 'eligibility',
      prompt: 'How old are you?',
      helperText: 'You must be at least 18 to participate in dating compatibility.',
      type: 'number',
      required: true,
      min: 18,
      max: 99,
    },
    {
      id: 'preferredMatchAgeRange',
      section: 'eligibility',
      prompt: 'What age range are you open to dating?',
      helperText: 'Choose a minimum and maximum between 18 and 99. I’m open to matches between these ages.',
      type: 'age_range',
      required: true,
      min: 18,
      max: 99,
    },
    {
      id: 'gender',
      section: 'eligibility',
      prompt: 'What is your gender?',
      type: 'single',
      required: true,
      options: [
        { value: 'woman', label: 'Woman' },
        { value: 'man', label: 'Man' },
        { value: 'non_binary', label: 'Non-binary' },
        { value: 'self_describe', label: 'Prefer to self-describe' },
        { value: 'prefer_not_to_say', label: 'Prefer not to say' },
      ],
    },
    {
      id: 'genderSelfDescribe',
      section: 'eligibility',
      prompt: 'Self-describe gender',
      helperText: 'Only shown to you. Never shared with other members.',
      type: 'text',
      required: true,
      visibleWhen: { field: 'gender', value: 'self_describe' },
    },
    {
      id: 'matchInterests',
      section: 'eligibility',
      prompt: 'Who are you interested in being matched with?',
      helperText: 'Select all that apply. “Open to all genders” cannot be combined with other options.',
      type: 'multi',
      required: true,
      exclusiveOption: 'open_to_all',
      options: [
        { value: 'women', label: 'Women' },
        { value: 'men', label: 'Men' },
        { value: 'non_binary', label: 'Non-binary people' },
        { value: 'open_to_all', label: 'I’m open to all genders' },
      ],
    },
    {
      id: 'relationshipIntention',
      section: 'values',
      prompt: 'What kind of relationship are you hoping to build?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Marriage and family life',
        'A serious long-term partnership that may lead to marriage',
        'A meaningful relationship, open to where it leads',
        'Dating intentionally but not focused on marriage',
        'Casual connection only',
      ]),
    },
    {
      id: 'faithValues',
      section: 'values',
      prompt:
        'How central is shared faith, values, or worldview in a relationship for you?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Essential',
        'Very important',
        'Somewhat important',
        'Nice, but not necessary',
        'Not important to me',
      ]),
    },
    {
      id: 'valuesVsChemistry',
      section: 'values',
      prompt: 'What matters more to you in long-term compatibility?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Shared values almost always matter more',
        'Shared values usually matter more',
        'Both matter equally',
        'Shared chemistry usually matters more',
        'Shared chemistry almost always matters more',
      ]),
    },
    {
      id: 'partnershipDailyLife',
      section: 'values',
      prompt: 'How do you picture partnership in daily life?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Building a very integrated life together',
        'Mostly shared life with some independence',
        'A balanced mix of closeness and independence',
        'Mostly independent lives with strong connection',
        'Very independent, low-interdependence partnership',
      ]),
    },
    {
      id: 'socialRhythm',
      section: 'values',
      prompt: 'What does your ideal social rhythm look like?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Mostly quiet, home-centered, low-social',
        'A calm rhythm with occasional social plans',
        'A balanced mix of home and social life',
        'A busy, social, active calendar',
        'Very social and out often',
      ]),
    },
    {
      id: 'saturdayStyle',
      section: 'values',
      prompt: 'How do you prefer to spend a free Saturday?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'At home recharging',
        'One simple plan and a relaxed day',
        'A mix of productivity and fun',
        'Out exploring most of the day',
        'Packed with activity and people',
      ]),
    },
    {
      id: 'planningSpontaneity',
      section: 'values',
      prompt: 'How do you feel about planning versus spontaneity?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'I strongly prefer plans',
        'I usually prefer plans',
        'I like both',
        'I usually prefer spontaneity',
        'I strongly prefer spontaneity',
      ]),
    },
    {
      id: 'ambition',
      section: 'values',
      prompt: 'How important is ambition and forward momentum in a partner?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Essential to me',
        'Very important',
        'Somewhat important',
        'Nice, but not necessary',
        'Not especially important',
      ]),
    },
    {
      id: 'maritalHistory',
      section: 'family',
      prompt: 'What best describes your own marital history?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Never married',
        'Previously engaged or in a serious long-term relationship, but never married',
        'Divorced',
        'Widowed',
        'Prefer not to say',
      ]),
    },
    {
      id: 'familySituation',
      section: 'family',
      prompt: 'What best describes your own family situation?',
      helperText: 'Select all that apply.',
      type: 'multi',
      required: true,
      options: [
        { value: 'no_children', label: 'I do not have children' },
        { value: 'children_full_time', label: 'I have children full-time' },
        { value: 'children_part_time', label: 'I have children part-time' },
        { value: 'grown_children', label: 'I have grown children' },
        {
          value: 'hope_future_children',
          label: 'I hope to have children in the future',
        },
        { value: 'prefer_not_to_say', label: 'Prefer not to say' },
      ],
    },
    {
      id: 'openToPartnerWithChildren',
      section: 'family',
      prompt: 'How open are you to dating someone who already has children?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Not open to this',
        'Rarely open to this',
        'Open in the right circumstances',
        'Generally open to this',
        'Fully open to this',
      ]),
    },
    {
      id: 'futureChildren',
      section: 'family',
      prompt: 'What are your hopes around having children in the future?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Definitely want children',
        'Probably want children',
        'Open / unsure',
        'I have children and don’t want more',
        'Definitely do not want children',
      ]),
    },
    {
      id: 'openToDivorced',
      section: 'family',
      prompt: 'How open are you to dating someone who has been divorced?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Not open to this',
        'Rarely open to this',
        'Open in the right circumstances',
        'Generally open to this',
        'Fully open to this',
      ]),
    },
    {
      id: 'partnerHistoryPreference',
      section: 'family',
      prompt: 'What relationship history feels most compatible to you?',
      type: 'single',
      required: true,
      options: ORDINAL_5([
        'Never married only',
        'Prefer never married, but open',
        'No strong preference',
        'Prefer someone who has had a serious past relationship and learned from it',
        'Relationship history is not important to me',
      ]),
    },
    {
      id: 'stayingActiveImportant',
      section: 'lifestyle',
      prompt: 'Staying active is an important part of who I am.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'enjoyDancingSocially',
      section: 'lifestyle',
      prompt: 'I enjoy dancing socially.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'enjoyEdgyHumor',
      section: 'lifestyle',
      prompt: 'I enjoy edgy or politically incorrect humor.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'preferLowKeyHangouts',
      section: 'lifestyle',
      prompt: 'I prefer low-key hangouts over high-energy nights out.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'needStructureOrganization',
      section: 'lifestyle',
      prompt: 'I need structure and organization in my life.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'spontaneousPlanReady',
      section: 'lifestyle',
      prompt: 'I’m usually down for a spontaneous plan.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'preferOneOnOne',
      section: 'lifestyle',
      prompt: 'I prefer one-on-one conversations to big group settings.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'sharedValuesOverHobbies',
      section: 'lifestyle',
      prompt: 'Shared values matter more to me than shared hobbies.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'likePlayfulBanter',
      section: 'lifestyle',
      prompt: 'I like playful banter.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'loveLanguagesImportant',
      section: 'lifestyle',
      prompt:
        'I think the five love languages are important in relationships.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'extendedFamilyTimeImportant',
      section: 'lifestyle',
      prompt: 'Extended family time is important to me.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'enjoyHostingGatherings',
      section: 'lifestyle',
      prompt: 'I enjoy hosting gatherings at my home.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'drinkAlcoholRegularly',
      section: 'lifestyle',
      prompt: 'I drink alcohol regularly.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'smokeRegularly',
      section: 'lifestyle',
      prompt: 'I smoke regularly.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
    {
      id: 'animalCompanyImportant',
      section: 'lifestyle',
      prompt: 'Enjoying the company of animals is important to me.',
      type: 'scale',
      required: true,
      options: AGREE_DISAGREE_5,
    },
  ]

export const COMPATIBILITY_CORE_ORDINAL_QUESTION_IDS = [
  'relationshipIntention',
  'faithValues',
  'valuesVsChemistry',
  'partnershipDailyLife',
  'socialRhythm',
  'saturdayStyle',
  'planningSpontaneity',
  'ambition',
  'maritalHistory',
  'openToPartnerWithChildren',
  'futureChildren',
  'openToDivorced',
  'partnerHistoryPreference',
] as const

export const COMPATIBILITY_LIFESTYLE_ORDINAL_QUESTION_IDS = [
  'stayingActiveImportant',
  'enjoyDancingSocially',
  'enjoyEdgyHumor',
  'preferLowKeyHangouts',
  'needStructureOrganization',
  'spontaneousPlanReady',
  'preferOneOnOne',
  'sharedValuesOverHobbies',
  'likePlayfulBanter',
  'loveLanguagesImportant',
  'extendedFamilyTimeImportant',
  'enjoyHostingGatherings',
  'drinkAlcoholRegularly',
  'smokeRegularly',
  'animalCompanyImportant',
] as const

export const COMPATIBILITY_ORDINAL_QUESTION_IDS = [
  ...COMPATIBILITY_CORE_ORDINAL_QUESTION_IDS,
  ...COMPATIBILITY_LIFESTYLE_ORDINAL_QUESTION_IDS,
] as const

export type CompatibilityOrdinalQuestionId =
  (typeof COMPATIBILITY_ORDINAL_QUESTION_IDS)[number]

export type CompatibilityLifestyleOrdinalQuestionId =
  (typeof COMPATIBILITY_LIFESTYLE_ORDINAL_QUESTION_IDS)[number]

export function questionsForSection(
  sectionId: CompatibilityQuestionnaireSectionId
): CompatibilityQuestionDefinition[] {
  return COMPATIBILITY_QUESTIONNAIRE_QUESTIONS.filter(
    (question) => question.section === sectionId
  )
}
