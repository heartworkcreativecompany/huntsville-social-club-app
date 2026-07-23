import type { ApplicationPhoto } from '@/lib/application'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import type { MemberPublicIntentValue } from '@/lib/member-public-intent'
import {
  CONNECTION_LOOKING_FOR_FIELD,
  memberPublicIntentLabelsFromValues,
  resolveMemberPublicIntents,
} from '@/lib/member-public-intent'

export type ProfileRevisionStatus = 'none' | 'pending' | 'rejected'

export type ProfilePendingRevision = {
  displayName: string
  bio: string
  locationArea: string
  memberPublicIntents: MemberPublicIntentValue[]
  /** Omitted when unchanged from live. */
  interests?: string[]
  /** Proposed photo set — omitted when unchanged from live. */
  photos?: ApplicationPhoto[]
  submittedAt: string
}

export type ProfileRevisionSnapshot = {
  displayName: string
  bio: string
  locationArea: string
  memberPublicIntents: MemberPublicIntentValue[]
  interests: string[]
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
  const interests = Array.isArray(raw.interests)
    ? raw.interests.filter((item): item is string => typeof item === 'string')
    : undefined

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

  const hasTextOrIntent =
    Boolean(displayName) ||
    Boolean(bio) ||
    Boolean(locationArea) ||
    memberPublicIntents.length > 0 ||
    (interests?.length ?? 0) > 0

  if (!hasTextOrIntent && photos === undefined) {
    return null
  }

  return {
    displayName,
    bio,
    locationArea,
    memberPublicIntents,
    interests,
    photos,
    submittedAt,
  }
}

export function profileRevisionStatusFromDb(
  value: string | null | undefined
): ProfileRevisionStatus {
  if (value === 'pending' || value === 'rejected') return value
  return 'none'
}

export function profileRevisionFieldLabels(): Record<
  'displayName' | 'bio' | 'locationArea' | 'memberPublicIntents' | 'interests',
  string
> {
  return {
    displayName: 'Display name',
    bio: 'About / bio',
    locationArea: 'Public area',
    memberPublicIntents: CONNECTION_LOOKING_FOR_FIELD.label,
    interests: 'Interests',
  }
}

function interestsKey(interests: string[]): string {
  return [...interests].map((item) => item.trim()).filter(Boolean).sort().join(',')
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
  return {
    displayName: draft.profile.displayName || profile.full_name || '',
    bio: draft.profile.aboutMe || profile.membership_intent || '',
    locationArea:
      draft.location.neighborhoodOrArea || profile.location_area || '',
    memberPublicIntents: resolveMemberPublicIntents({
      connection_intents:
        profile.connection_intents ?? draft.profile.connectionIntents,
      connections_open_to: profile.connections_open_to,
      discovery_intent: profile.discovery_intent,
    }),
    interests:
      (profile.discovery_interests ?? []).filter((item) => item.trim()).length > 0
        ? (profile.discovery_interests ?? []).filter((item) => item.trim())
        : draft.workAndInterests.interests.filter((item) => item.trim()),
    photos: photosFromApplicationDraft(profile.application_draft),
  }
}

export function buildProfileRevisionDiff(
  live: ProfileRevisionSnapshot,
  pending: ProfilePendingRevision
): ProfileRevisionDiff {
  const labels = profileRevisionFieldLabels()
  const pendingIntents = pending.memberPublicIntents
  const pendingPhotos = pending.photos ?? live.photos
  const pendingInterests = pending.interests ?? live.interests

  const displayNameChanged =
    live.displayName.trim() !== pending.displayName.trim()
  const bioChanged = live.bio.trim() !== pending.bio.trim()
  const locationChanged =
    live.locationArea.trim() !== pending.locationArea.trim()
  const intentsChanged =
    [...live.memberPublicIntents].sort().join(',') !==
    [...pendingIntents].sort().join(',')
  const interestsChanged =
    pending.interests !== undefined &&
    interestsKey(live.interests) !== interestsKey(pending.interests)
  const photosChanged = photosRevisionChanged(live.photos, pending.photos)

  const changedFields: string[] = []
  if (displayNameChanged) changedFields.push(labels.displayName)
  if (locationChanged) changedFields.push(labels.locationArea)
  if (bioChanged) changedFields.push(labels.bio)
  if (intentsChanged) changedFields.push(labels.memberPublicIntents)
  if (interestsChanged) changedFields.push(labels.interests)
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
    photos: snapshot.photos,
  }
}

export function pendingProfileFormValues(revision: ProfilePendingRevision) {
  return {
    displayName: revision.displayName,
    bio: revision.bio,
    locationArea: revision.locationArea,
    memberPublicIntents: revision.memberPublicIntents,
    interests: revision.interests ?? [],
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
