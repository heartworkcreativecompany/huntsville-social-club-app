/**
 * Optional event descriptor labels. These are not member-profile interests
 * and are not access-control values. Event visibility, ticketing, credits,
 * and membership access continue to use `event_type` (and related fields).
 *
 * Events currently have no `tags` column. Do not persist these labels on
 * events until a dedicated optional `text[]` column is added.
 */
export const EVENT_TAG_OPTIONS = [
  'Family-friendly events',
  'Cultural outings',
  'Members-only gatherings',
] as const
