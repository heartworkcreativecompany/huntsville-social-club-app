import type { ApplicationPhoto } from '@/lib/application'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import type { MemberPublicIntentValue } from '@/lib/member-public-intent'
import {
  CONNECTION_LOOKING_FOR_FIELD,
  CONNECTION_TYPES_OPEN_TO_FIELD,
  memberPublicIntentLabelsFromValues,
  resolveMemberPublicIntents,
  sanitizeConnectionsOpenToForStorage,
} from '@/lib/member-public-intent'

export type ProfileRevisionStatus = 'none' | 'pending' | 'rejected'

export type ProfilePendingRevision = {
  displayName: string
  bio: string
  locationArea: string
  memberPublicIntents: MemberPublicIntentValue[]
  /** Omitted when unchanged from live. */
  interests?: string[]
  occupation?: string
  industry?: string
  lifestyleTags?: string[]
  eventInterests?: string[]
  socialVibe?: string
  connectionsOpenTo?: string[]
  perfectWeekend?: string
  favoriteLocalActivities?: string
  icebreaker?: string
  /** Proposed photo set — omitted when unchanged from live. */
  photos?: ApplicationPhoto[]
  submittedAt: string
  /**
   * Stable UUID minted once when this pending revision is submitted.
   * Omitted on legacy pending revisions created before this field existed.
   */
  intentEventId?: string
}

export type ProfileRevisionSnapshot = {
  displayName: string
  bio: string
  locationArea: string
  memberPublicIntents: MemberPublicIntentValue[]
  interests: string[]
  occupation: string
  industry: string
  lifestyleTags: string[]
  eventInterests: string[]
  socialVibe: string
  connectionsOpenTo: string[]
  perfectWeekend: string
  favoriteLocalActivities: string
  icebreaker: string
  photos: ApplicationPhoto[]
}

export type ProfileFieldDiff<T> = {
  live: T
  pending: T
  changed: boolean
}

export type ProfileRevisionDiff = {
  displayName: ProfileFieldDiff<string>
  locationArea: ProfileFieldDiff<string>
  bio: ProfileFieldDiff<string>
  memberPublicIntents: ProfileFieldDiff<MemberPublicIntentValue[]>
  interests: ProfileFieldDiff<string[]>
  occupation: ProfileFieldDiff<string>
  industry: ProfileFieldDiff<string>
  lifestyleTags: ProfileFieldDiff<string[]>
  eventInterests: ProfileFieldDiff<string[]>
  socialVibe: ProfileFieldDiff<string>
  connectionsOpenTo: ProfileFieldDiff<string[]>
  perfectWeekend: ProfileFieldDiff<string>
  favoriteLocalActivities: ProfileFieldDiff<string>
  icebreaker: ProfileFieldDiff<string>
  photos: ProfileFieldDiff<ApplicationPhoto[]>
  changedFields: string[]
}

function photoFingerprint(photo: ApplicationPhoto): string {
  return `${photo.id}|${photo.storagePath}|${photo.isPrimary}|${photo.facePhotoConfirmed}`
}

export function photosEqual(
  a: ApplicationPhoto[],
  b: ApplicationPhoto[]
): boolean {
  if (a.length !== b.length) return false
  const left = a.map(photoFingerprint).sort().join('::')
  const right = b.map(photoFingerprint).sort().join('::')
  return left === right
}

export function photosRevisionChanged(
  live: ApplicationPhoto[],
  pending: ApplicationPhoto[] | undefined
): boolean {
  if (pending === undefined) return false
  return !photosEqual(live, pending)
}

export function emptyProfilePendingRevision(): ProfilePendingRevision {
  return {
    displayName: '',
    bio: '',
    locationArea: '',
    memberPublicIntents: [],
    submittedAt: new Date().toISOString(),
  }
}

/** True when a pending revision carries a non-empty stable submit-time event id. */
export function isUsableIntentEventId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function parseRevisionPhotos(value: unknown): ApplicationPhoto[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value as ApplicationPhoto[]
}

export function parseProfilePendingRevision(
  value: unknown
): ProfilePendingRevision | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const memberPublicIntents = Array.isArray(raw.memberPublicIntents)
    ? raw.memberPublicIntents.filter(
        (item): item is MemberPublicIntentValue =>
          item === 'networking' || item === 'dating' || item === 'friends'
      )
    : []
  const interests = parseStringList(raw.interests)
  const lifestyleTags = parseStringList(raw.lifestyleTags)
  const eventInterests = parseStringList(raw.eventInterests)
  const connectionsOpenTo = parseStringList(raw.connectionsOpenTo)

  const displayName =
    typeof raw.displayName === 'string' ? raw.displayName.trim() : ''
  const bio = typeof raw.bio === 'string' ? raw.bio.trim() : ''
  const locationArea =
    typeof raw.locationArea === 'string' ? raw.locationArea.trim() : ''
  const submittedAt =
    typeof raw.submittedAt === 'string' && raw.submittedAt.length > 0
      ? raw.submittedAt
      : new Date().toISOString()
  const photos = parseRevisionPhotos(raw.photos)
  const intentEventId = isUsableIntentEventId(raw.intentEventId)
    ? raw.intentEventId.trim()
    : undefined

  const hasTextOrIntent =
    Boolean(displayName) ||
    Boolean(bio) ||
    Boolean(locationArea) ||
    memberPublicIntents.length > 0 ||
    (interests?.length ?? 0) > 0 ||
    Boolean(parseOptionalString(raw.occupation)?.trim()) ||
    Boolean(parseOptionalString(raw.industry)?.trim()) ||
    (lifestyleTags?.length ?? 0) > 0 ||
    (eventInterests?.length ?? 0) > 0 ||
    Boolean(parseOptionalString(raw.socialVibe)?.trim()) ||
    (connectionsOpenTo?.length ?? 0) > 0 ||
    Boolean(parseOptionalString(raw.perfectWeekend)?.trim()) ||
    Boolean(parseOptionalString(raw.favoriteLocalActivities)?.trim()) ||
    Boolean(parseOptionalString(raw.icebreaker)?.trim())

  if (!hasTextOrIntent && photos === undefined) {
    return null
  }

  return {
    displayName,
    bio,
    locationArea,
    memberPublicIntents,
    interests,
    occupation: parseOptionalString(raw.occupation),
    industry: parseOptionalString(raw.industry),
    lifestyleTags,
    eventInterests,
    socialVibe: parseOptionalString(raw.socialVibe),
    connectionsOpenTo,
    perfectWeekend: parseOptionalString(raw.perfectWeekend),
    favoriteLocalActivities: parseOptionalString(raw.favoriteLocalActivities),
    icebreaker: parseOptionalString(raw.icebreaker),
    photos,
    submittedAt,
    ...(intentEventId ? { intentEventId } : {}),
  }
}

export function profileRevisionStatusFromDb(
  value: string | null | undefined
): ProfileRevisionStatus {
  if (value === 'pending' || value === 'rejected') return value
  return 'none'
}

export function profileRevisionFieldLabels(): Record<
  | 'displayName'
  | 'bio'
  | 'locationArea'
  | 'memberPublicIntents'
  | 'interests'
  | 'occupation'
  | 'industry'
  | 'lifestyleTags'
  | 'eventInterests'
  | 'socialVibe'
  | 'connectionsOpenTo'
  | 'perfectWeekend'
  | 'favoriteLocalActivities'
  | 'icebreaker',
  string
> {
  return {
    displayName: 'Display name',
    bio: 'About / bio',
    locationArea: 'Public area',
    memberPublicIntents: CONNECTION_LOOKING_FOR_FIELD.label,
    interests: 'Interests',
    occupation: 'Work',
    industry: 'Industry',
    lifestyleTags: 'Lifestyle',
    eventInterests: 'Event interests',
    socialVibe: 'Event vibe',
    connectionsOpenTo: CONNECTION_TYPES_OPEN_TO_FIELD.label,
    perfectWeekend: 'Perfect weekend',
    favoriteLocalActivities: 'Favorite local activities',
    icebreaker: 'Icebreaker',
  }
}

function listKey(values: string[]): string {
  return [...values].map((item) => item.trim()).filter(Boolean).sort().join(',')
}

export function formatMemberPublicIntentsForDisplay(
  intents: MemberPublicIntentValue[]
): string {
  return memberPublicIntentLabelsFromValues(intents).join(', ')
}

export function liveProfileRevisionSnapshot(profile: {
  full_name: string | null
  membership_intent: string | null
  location_area: string | null
  application_draft: unknown
  connections_open_to?: string[] | null
  connection_intents?: string[] | null
  discovery_intent?: string | null
  discovery_interests?: string[] | null
}): ProfileRevisionSnapshot {
  const draft = mergeProfileIntoDraft(profile)
  const memberPublicIntents = resolveMemberPublicIntents({
    connection_intents:
      profile.connection_intents ?? draft.profile.connectionIntents,
    connections_open_to: profile.connections_open_to,
    discovery_intent: profile.discovery_intent,
  })
  const connectionsOpenTo = sanitizeConnectionsOpenToForStorage(
    profile.connections_open_to ?? draft.profile.connectionsOpenTo,
    memberPublicIntents
  )

  return {
    displayName: draft.profile.displayName || profile.full_name || '',
    bio: draft.profile.aboutMe || profile.membership_intent || '',
    locationArea:
      draft.location.neighborhoodOrArea || profile.location_area || '',
    memberPublicIntents,
    interests:
      (profile.discovery_interests ?? []).filter((item) => item.trim()).length > 0
        ? (profile.discovery_interests ?? []).filter((item) => item.trim())
        : draft.workAndInterests.interests.filter((item) => item.trim()),
    occupation: draft.workAndInterests.occupation.trim(),
    industry: draft.workAndInterests.industry.trim(),
    lifestyleTags: draft.workAndInterests.lifestyleTags.filter((item) =>
      item.trim()
    ),
    eventInterests: draft.workAndInterests.eventInterests.filter((item) =>
      item.trim()
    ),
    socialVibe: draft.workAndInterests.socialVibe.trim(),
    connectionsOpenTo,
    perfectWeekend: draft.prompts.perfectWeekend.trim(),
    favoriteLocalActivities: draft.prompts.favoriteLocalActivities.trim(),
    icebreaker: draft.prompts.icebreaker.trim(),
    photos: photosFromApplicationDraft(profile.application_draft),
  }
}

function stringChanged(live: string, pending: string): boolean {
  return live.trim() !== pending.trim()
}

function listChanged(live: string[], pending: string[]): boolean {
  return listKey(live) !== listKey(pending)
}

export function buildProfileRevisionDiff(
  live: ProfileRevisionSnapshot,
  pending: ProfilePendingRevision
): ProfileRevisionDiff {
  const labels = profileRevisionFieldLabels()
  const pendingIntents = pending.memberPublicIntents
  const pendingPhotos = pending.photos ?? live.photos
  const pendingInterests = pending.interests ?? live.interests
  const pendingOccupation = pending.occupation ?? live.occupation
  const pendingIndustry = pending.industry ?? live.industry
  const pendingLifestyle = pending.lifestyleTags ?? live.lifestyleTags
  const pendingEventInterests = pending.eventInterests ?? live.eventInterests
  const pendingSocialVibe = pending.socialVibe ?? live.socialVibe
  const pendingConnectionsOpenTo =
    pending.connectionsOpenTo ?? live.connectionsOpenTo
  const pendingPerfectWeekend = pending.perfectWeekend ?? live.perfectWeekend
  const pendingFavoriteLocal =
    pending.favoriteLocalActivities ?? live.favoriteLocalActivities
  const pendingIcebreaker = pending.icebreaker ?? live.icebreaker

  const displayNameChanged = stringChanged(live.displayName, pending.displayName)
  const bioChanged = stringChanged(live.bio, pending.bio)
  const locationChanged = stringChanged(live.locationArea, pending.locationArea)
  const intentsChanged =
    [...live.memberPublicIntents].sort().join(',') !==
    [...pendingIntents].sort().join(',')
  const interestsChanged =
    pending.interests !== undefined &&
    listChanged(live.interests, pending.interests)
  const occupationChanged =
    pending.occupation !== undefined &&
    stringChanged(live.occupation, pending.occupation)
  const industryChanged =
    pending.industry !== undefined &&
    stringChanged(live.industry, pending.industry)
  const lifestyleChanged =
    pending.lifestyleTags !== undefined &&
    listChanged(live.lifestyleTags, pending.lifestyleTags)
  const eventInterestsChanged =
    pending.eventInterests !== undefined &&
    listChanged(live.eventInterests, pending.eventInterests)
  const socialVibeChanged =
    pending.socialVibe !== undefined &&
    stringChanged(live.socialVibe, pending.socialVibe)
  const connectionsOpenToChanged =
    pending.connectionsOpenTo !== undefined &&
    listChanged(live.connectionsOpenTo, pending.connectionsOpenTo)
  const perfectWeekendChanged =
    pending.perfectWeekend !== undefined &&
    stringChanged(live.perfectWeekend, pending.perfectWeekend)
  const favoriteLocalChanged =
    pending.favoriteLocalActivities !== undefined &&
    stringChanged(live.favoriteLocalActivities, pending.favoriteLocalActivities)
  const icebreakerChanged =
    pending.icebreaker !== undefined &&
    stringChanged(live.icebreaker, pending.icebreaker)
  const photosChanged = photosRevisionChanged(live.photos, pending.photos)

  const changedFields: string[] = []
  if (displayNameChanged) changedFields.push(labels.displayName)
  if (locationChanged) changedFields.push(labels.locationArea)
  if (bioChanged) changedFields.push(labels.bio)
  if (intentsChanged) changedFields.push(labels.memberPublicIntents)
  if (interestsChanged) changedFields.push(labels.interests)
  if (occupationChanged || industryChanged) {
    changedFields.push(
      occupationChanged && industryChanged
        ? 'Work'
        : occupationChanged
          ? labels.occupation
          : labels.industry
    )
  }
  if (lifestyleChanged) changedFields.push(labels.lifestyleTags)
  if (eventInterestsChanged) changedFields.push(labels.eventInterests)
  if (socialVibeChanged) changedFields.push(labels.socialVibe)
  if (connectionsOpenToChanged) changedFields.push(labels.connectionsOpenTo)
  if (perfectWeekendChanged) changedFields.push(labels.perfectWeekend)
  if (favoriteLocalChanged) changedFields.push(labels.favoriteLocalActivities)
  if (icebreakerChanged) changedFields.push(labels.icebreaker)
  if (photosChanged) changedFields.push('Photos')

  return {
    displayName: {
      live: live.displayName,
      pending: pending.displayName,
      changed: displayNameChanged,
    },
    locationArea: {
      live: live.locationArea,
      pending: pending.locationArea,
      changed: locationChanged,
    },
    bio: {
      live: live.bio,
      pending: pending.bio,
      changed: bioChanged,
    },
    memberPublicIntents: {
      live: live.memberPublicIntents,
      pending: pendingIntents,
      changed: intentsChanged,
    },
    interests: {
      live: live.interests,
      pending: pendingInterests,
      changed: interestsChanged,
    },
    occupation: {
      live: live.occupation,
      pending: pendingOccupation,
      changed: occupationChanged,
    },
    industry: {
      live: live.industry,
      pending: pendingIndustry,
      changed: industryChanged,
    },
    lifestyleTags: {
      live: live.lifestyleTags,
      pending: pendingLifestyle,
      changed: lifestyleChanged,
    },
    eventInterests: {
      live: live.eventInterests,
      pending: pendingEventInterests,
      changed: eventInterestsChanged,
    },
    socialVibe: {
      live: live.socialVibe,
      pending: pendingSocialVibe,
      changed: socialVibeChanged,
    },
    connectionsOpenTo: {
      live: live.connectionsOpenTo,
      pending: pendingConnectionsOpenTo,
      changed: connectionsOpenToChanged,
    },
    perfectWeekend: {
      live: live.perfectWeekend,
      pending: pendingPerfectWeekend,
      changed: perfectWeekendChanged,
    },
    favoriteLocalActivities: {
      live: live.favoriteLocalActivities,
      pending: pendingFavoriteLocal,
      changed: favoriteLocalChanged,
    },
    icebreaker: {
      live: live.icebreaker,
      pending: pendingIcebreaker,
      changed: icebreakerChanged,
    },
    photos: {
      live: live.photos,
      pending: pendingPhotos,
      changed: photosChanged,
    },
    changedFields,
  }
}

export function listProfileRevisionChanges(
  live: ProfileRevisionSnapshot,
  pending: ProfilePendingRevision
): string[] {
  return buildProfileRevisionDiff(live, pending).changedFields
}

export function liveProfileFormValues(profile: {
  full_name: string | null
  membership_intent: string | null
  location_area: string | null
  application_draft: unknown
  connections_open_to?: string[] | null
  connection_intents?: string[] | null
  discovery_intent?: string | null
  discovery_interests?: string[] | null
}) {
  const snapshot = liveProfileRevisionSnapshot(profile)
  return {
    displayName: snapshot.displayName,
    bio: snapshot.bio,
    locationArea: snapshot.locationArea,
    memberPublicIntents: snapshot.memberPublicIntents,
    interests: snapshot.interests,
    occupation: snapshot.occupation,
    industry: snapshot.industry,
    lifestyleTags: snapshot.lifestyleTags,
    eventInterests: snapshot.eventInterests,
    socialVibe: snapshot.socialVibe,
    connectionsOpenTo: snapshot.connectionsOpenTo,
    perfectWeekend: snapshot.perfectWeekend,
    favoriteLocalActivities: snapshot.favoriteLocalActivities,
    icebreaker: snapshot.icebreaker,
    photos: snapshot.photos,
  }
}

export function pendingProfileFormValues(
  revision: ProfilePendingRevision,
  live: ReturnType<typeof liveProfileFormValues>
) {
  return {
    displayName: revision.displayName,
    bio: revision.bio,
    locationArea: revision.locationArea,
    memberPublicIntents: revision.memberPublicIntents,
    interests: revision.interests ?? live.interests,
    occupation: revision.occupation ?? live.occupation,
    industry: revision.industry ?? live.industry,
    lifestyleTags: revision.lifestyleTags ?? live.lifestyleTags,
    eventInterests: revision.eventInterests ?? live.eventInterests,
    socialVibe: revision.socialVibe ?? live.socialVibe,
    connectionsOpenTo: revision.connectionsOpenTo ?? live.connectionsOpenTo,
    perfectWeekend: revision.perfectWeekend ?? live.perfectWeekend,
    favoriteLocalActivities:
      revision.favoriteLocalActivities ?? live.favoriteLocalActivities,
    icebreaker: revision.icebreaker ?? live.icebreaker,
    photos: revision.photos,
  }
}

export function editorPhotosForRevision(input: {
  revisionStatus: ProfileRevisionStatus
  livePhotos: ApplicationPhoto[]
  pendingRevision: ProfilePendingRevision | null
}): ApplicationPhoto[] {
  if (
    input.revisionStatus === 'pending' &&
    input.pendingRevision?.photos !== undefined
  ) {
    return input.pendingRevision.photos
  }
  return input.livePhotos
}
