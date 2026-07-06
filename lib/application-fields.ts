/**
 * Application field classification for launch UX.
 * - approval: required for submit / admin review
 * - discovery: feeds member directory filters
 * - profile: shown to other approved members
 * - internal: admin/verification only, never on public profile
 * - optionalTrust: does not block standard approval
 */

export type FieldVisibility =
  | 'approval'
  | 'discovery'
  | 'profile'
  | 'internal'
  | 'optionalTrust'

export const CONNECTION_OPEN_TO_OPTIONS = [
  'Dating',
  'New friends',
  'Professional peers',
  'Activity partners',
  'Community collaborators',
  'Low-key social hangs',
  'Members-only events',
] as const

export const SOCIAL_VIBE_OPTIONS = [
  'Small & intimate',
  'Casual & low-key',
  'Active & outdoors',
  'Cultural & curated',
  'Professional & purposeful',
] as const

/** Launch-ready prompt keys shown in the application form. */
export const ACTIVE_PROMPT_KEYS = [
  'bringsYouHere',
  'hopingToMeet',
  'perfectWeekend',
  'favoriteLocalActivities',
  'icebreaker',
] as const

export type ActivePromptKey = (typeof ACTIVE_PROMPT_KEYS)[number]

/** Legacy prompt keys — parsed from old drafts, not shown in form. */
export const LEGACY_PROMPT_KEYS = ['intoLately', 'valueInCommunity'] as const
