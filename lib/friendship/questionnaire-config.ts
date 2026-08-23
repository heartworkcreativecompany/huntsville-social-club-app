export const FRIENDSHIP_QUESTIONNAIRE_VERSION = 1 as const

export type FriendshipQuestionnaireSectionId =
  | 'goals'
  | 'social'
  | 'lifestyle'
  | 'communication'
  | 'values'
  | 'priorities'

export type FriendshipQuestionFieldType = 'single' | 'multi' | 'scale'

export type FriendshipQuestionOption = {
  value: string | number
  label: string
}

export type FriendshipQuestionDefinition = {
  id: string
  section: FriendshipQuestionnaireSectionId
  prompt: string
  helperText?: string
  type: FriendshipQuestionFieldType
  options?: FriendshipQuestionOption[]
  required: boolean
  /** Multi-select option that cannot be combined with others. */
  exclusiveOption?: string
  maxSelections?: number
  /** Sensitive fields excluded from scoring when unanswered or prefer-not-to-answer. */
  sensitive?: boolean
  scoring?: 'ordinal' | 'jaccard' | 'near_match' | 'exclude'
}

export type FriendshipQuestionnaireSection = {
  id: FriendshipQuestionnaireSectionId
  title: string
  description: string
}

export const FRIENDSHIP_QUESTIONNAIRE_SECTIONS: FriendshipQuestionnaireSection[] =
  [
    {
      id: 'goals',
      title: 'Friendship goals',
      description:
        'These answers stay private. They help us recommend friends who want a similar kind of connection.',
    },
    {
      id: 'social',
      title: 'Social style',
      description:
        'Rate how much each statement sounds like you (1 = Not like me, 5 = Very much like me).',
    },
    {
      id: 'lifestyle',
      title: 'Lifestyle',
      description:
        'Rate how much each statement sounds like you. Alcohol questions can be skipped with Prefer not to answer and are not used in scoring.',
    },
    {
      id: 'communication',
      title: 'Communication and reliability',
      description:
        'Rate how much each statement sounds like you (1 = Not like me, 5 = Very much like me).',
    },
    {
      id: 'values',
      title: 'Values and community',
      description:
        'Rate how much each statement sounds like you (1 = Not like me, 5 = Very much like me).',
    },
    {
      id: 'priorities',
      title: 'What matters most in a friendship?',
      description:
        'Choose up to 3. These stay private and are only used to weight your own recommendations.',
    },
  ]

const ORDINAL_5 = (labels: string[]): FriendshipQuestionOption[] =>
  labels.map((label, index) => ({ value: index + 1, label }))

export const FRIENDSHIP_LIKE_ME_SCALE = ORDINAL_5([
  '1 Not like me',
  '2 Slightly like me',
  '3 Sometimes / neutral',
  '4 Mostly like me',
  '5 Very much like me',
])

export const FRIENDSHIP_GOAL_OPTIONS: FriendshipQuestionOption[] = [
  { value: 'one_on_one', label: 'One-on-one close friends' },
  { value: 'friend_group', label: 'A friend group' },
  { value: 'activity_hobby', label: 'Activity or hobby friends' },
  { value: 'going_out', label: 'Going-out friends' },
  { value: 'professional', label: 'Professional friends and collaborators' },
  { value: 'parent_family', label: 'Parent/family friends' },
  { value: 'new_to_huntsville', label: 'New-to-Huntsville connections' },
  { value: 'mix_all', label: 'A mix of all of the above' },
]

export const FRIENDSHIP_GOAL_VALUES = FRIENDSHIP_GOAL_OPTIONS.map(
  (option) => option.value as string
)

export const FRIENDSHIP_EXPANDABLE_GOAL_VALUES = FRIENDSHIP_GOAL_VALUES.filter(
  (value) => value !== 'mix_all'
)

export const FRIENDSHIP_TIME_OPTIONS: FriendshipQuestionOption[] = [
  { value: 'few_times_month', label: 'A few times a month' },
  { value: 'once_week', label: 'About once a week' },
  { value: 'multiple_week', label: 'Multiple times a week' },
  { value: 'flexible', label: 'Flexible / depends on the connection' },
]

export const FRIENDSHIP_TIME_VALUES = FRIENDSHIP_TIME_OPTIONS.map(
  (option) => option.value as string
)

export const FRIENDSHIP_HANGOUT_OPTIONS: FriendshipQuestionOption[] = [
  { value: 'coffee_brunch', label: 'Coffee or brunch' },
  { value: 'dinner_conversation', label: 'Dinner and conversation' },
  { value: 'hiking_outdoor', label: 'Hiking, walking, or outdoor activity' },
  { value: 'fitness_sports', label: 'Fitness class or sports' },
  { value: 'game_night', label: 'Game night' },
  { value: 'live_music_nightlife', label: 'Live music or nightlife' },
  { value: 'volunteering', label: 'Volunteering' },
  { value: 'creative', label: 'Creative activity' },
  { value: 'shopping_exploring', label: 'Shopping or exploring local places' },
  { value: 'staying_in', label: 'Staying in and watching something' },
  { value: 'local_events', label: 'Attending local events' },
  {
    value: 'coworking',
    label: 'Working alongside each other at a café or coworking space',
  },
]

export const FRIENDSHIP_HANGOUT_VALUES = FRIENDSHIP_HANGOUT_OPTIONS.map(
  (option) => option.value as string
)

export const FRIENDSHIP_ALCOHOL_FREQUENCY_OPTIONS: FriendshipQuestionOption[] = [
  { value: 'never', label: 'Never' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'occasionally', label: 'Occasionally' },
  { value: 'often', label: 'Often' },
  { value: 'prefer_not_to_answer', label: 'Prefer not to answer' },
]

export const FRIENDSHIP_ALCOHOL_COMFORT_OPTIONS: FriendshipQuestionOption[] = [
  { value: 'not_comfortable', label: 'Not comfortable' },
  { value: 'sometimes', label: 'Sometimes comfortable' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'very_comfortable', label: 'Very comfortable' },
  { value: 'prefer_not_to_answer', label: 'Prefer not to answer' },
]

export const FRIENDSHIP_PRIORITY_OPTIONS: FriendshipQuestionOption[] = [
  { value: 'shared_interests', label: 'Shared interests and activities' },
  { value: 'similar_lifestyle', label: 'Similar lifestyle and social habits' },
  {
    value: 'emotional_support',
    label: 'Emotional support and deeper conversations',
  },
  { value: 'communication_reliability', label: 'Communication and reliability' },
  { value: 'humor_personality', label: 'Humor and personality' },
  { value: 'faith_family_values', label: 'Faith, family, and core values' },
  {
    value: 'professional_networking',
    label: 'Professional networking and accountability',
  },
  { value: 'new_local_experiences', label: 'Trying new local experiences' },
]

export const FRIENDSHIP_PRIORITY_VALUES = FRIENDSHIP_PRIORITY_OPTIONS.map(
  (option) => option.value as string
)

export const FRIENDSHIP_PREFER_NOT_TO_ANSWER = 'prefer_not_to_answer' as const

export const FRIENDSHIP_QUESTIONNAIRE_QUESTIONS: FriendshipQuestionDefinition[] =
  [
    {
      id: 'friendshipGoals',
      section: 'goals',
      prompt: 'Friendship goals',
      helperText: 'Choose all that apply.',
      type: 'multi',
      required: true,
      exclusiveOption: 'mix_all',
      options: FRIENDSHIP_GOAL_OPTIONS,
      scoring: 'jaccard',
    },
    {
      id: 'desiredTimeTogether',
      section: 'goals',
      prompt: 'Desired time with new friends',
      type: 'single',
      required: true,
      options: FRIENDSHIP_TIME_OPTIONS,
      scoring: 'near_match',
    },
    {
      id: 'longTermMeaningful',
      section: 'goals',
      prompt:
        'I’m looking for friendships that can grow into a meaningful, long-term part of my life.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'wideCircleAndDeep',
      section: 'goals',
      prompt:
        'I’m happy having a wide circle of casual friends as well as a few deeper friendships.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'rechargeWithPeople',
      section: 'social',
      prompt: 'I recharge by spending time with people.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'preferOneOnOne',
      section: 'social',
      prompt: 'I prefer one-on-one hangouts over larger group settings.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'enjoyRegularFriendGroup',
      section: 'social',
      prompt: 'I enjoy being part of a regular friend group.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'likeMeetingNewPeople',
      section: 'social',
      prompt: 'I like meeting new people and being introduced to friends-of-friends.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'preferSpontaneousPlans',
      section: 'social',
      prompt: 'I prefer spontaneous plans over scheduling things in advance.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'comfortableInitiating',
      section: 'social',
      prompt: 'I’m comfortable initiating plans or inviting someone to join me.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'idealHangouts',
      section: 'social',
      prompt: 'Ideal friend hangouts',
      helperText: 'Choose up to 3.',
      type: 'multi',
      required: true,
      maxSelections: 3,
      options: FRIENDSHIP_HANGOUT_OPTIONS,
      scoring: 'jaccard',
    },
    {
      id: 'stayActiveOutside',
      section: 'lifestyle',
      prompt: 'I enjoy staying active and doing things outside the house.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'enjoyLowKeyHangouts',
      section: 'lifestyle',
      prompt: 'I enjoy low-key hangouts at home or in quiet places.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'likeNightlife',
      section: 'lifestyle',
      prompt: 'I like going out for nightlife, live music, dancing, or social events.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'preferStructuredSchedule',
      section: 'lifestyle',
      prompt: 'I prefer a structured, organized schedule.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'openToLastMinutePlans',
      section: 'lifestyle',
      prompt: 'I’m open to last-minute plans.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'alcoholFrequency',
      section: 'lifestyle',
      prompt: 'Alcohol frequency in social settings',
      type: 'single',
      required: true,
      sensitive: true,
      scoring: 'exclude',
      options: FRIENDSHIP_ALCOHOL_FREQUENCY_OPTIONS,
    },
    {
      id: 'alcoholComfort',
      section: 'lifestyle',
      prompt: 'Comfort around alcohol at social events',
      type: 'single',
      required: true,
      sensitive: true,
      scoring: 'exclude',
      options: FRIENDSHIP_ALCOHOL_COMFORT_OPTIONS,
    },
    {
      id: 'petsImportant',
      section: 'lifestyle',
      prompt: 'Are pets or animals an important part of your life?',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'enjoyHosting',
      section: 'lifestyle',
      prompt: 'I enjoy hosting people at my home or being invited into friends’ homes.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'stayInTouchByText',
      section: 'communication',
      prompt: 'I like to stay in touch by text between hangouts.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'near_match',
    },
    {
      id: 'preferDirectCommunication',
      section: 'communication',
      prompt: 'I prefer direct communication over hints or passive-aggressive behavior.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'followThroughOnPlans',
      section: 'communication',
      prompt: 'If I say I’m going to make plans, I usually follow through.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'appreciateCheckIns',
      section: 'communication',
      prompt: 'I appreciate friends who check in when they have not heard from me.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'comfortableTalkingPersonal',
      section: 'communication',
      prompt: 'I’m comfortable talking about personal things once trust has been built.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'preferTalkAboutIssues',
      section: 'communication',
      prompt:
        'When something bothers me, I prefer to talk about it respectfully rather than avoid it.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'valueKindnessInclusivity',
      section: 'values',
      prompt:
        'I value kindness, inclusivity, and respect for people with different backgrounds.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'supportLocalCommunity',
      section: 'values',
      prompt: 'I enjoy supporting local businesses, events, and community spaces.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'givingBackMatters',
      section: 'values',
      prompt: 'Giving back, volunteering, or helping others matters to me.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'personalGrowthMatters',
      section: 'values',
      prompt: 'Personal growth and trying new things are important to me.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'familyTimeImportant',
      section: 'values',
      prompt: 'Family time is an important part of my life.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'enjoyPlayfulBanter',
      section: 'values',
      prompt: 'I enjoy playful banter and humor in my friendships.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'humorCanBeEdgy',
      section: 'values',
      prompt: 'My humor can be edgy or politically incorrect.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'wantEmotionalSupport',
      section: 'values',
      prompt: 'I want friends who are emotionally supportive during difficult seasons.',
      type: 'scale',
      required: true,
      options: FRIENDSHIP_LIKE_ME_SCALE,
      scoring: 'ordinal',
    },
    {
      id: 'friendshipPriorities',
      section: 'priorities',
      prompt: 'What matters most in a friendship?',
      helperText: 'Choose up to 3. These stay private.',
      type: 'multi',
      required: true,
      maxSelections: 3,
      options: FRIENDSHIP_PRIORITY_OPTIONS,
    },
  ]

export const FRIENDSHIP_PROMPT_QUESTIONS = FRIENDSHIP_QUESTIONNAIRE_QUESTIONS.filter(
  (question) => question.id !== 'friendshipPriorities'
)

export const FRIENDSHIP_ORDINAL_QUESTION_IDS = FRIENDSHIP_QUESTIONNAIRE_QUESTIONS.filter(
  (question) => question.type === 'scale'
).map((question) => question.id)

export const FRIENDSHIP_MULTI_QUESTION_IDS = [
  'friendshipGoals',
  'idealHangouts',
  'friendshipPriorities',
] as const

export const FRIENDSHIP_SENSITIVE_QUESTION_IDS = [
  'alcoholFrequency',
  'alcoholComfort',
] as const

export function friendshipQuestionsForSection(
  sectionId: FriendshipQuestionnaireSectionId
): FriendshipQuestionDefinition[] {
  return FRIENDSHIP_QUESTIONNAIRE_QUESTIONS.filter(
    (question) => question.section === sectionId
  )
}
