import {
  memberPublicIntentsFromConnectionsOpenTo,
  parseConnectionIntents,
  type MemberPublicIntentValue,
} from '@/lib/member-public-intent'
import { APPLICATION_TOTAL_STEPS } from '@/lib/application-form-content'
import { normalizeDiscoveryIntent } from '@/lib/membership-systems'

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'needs_info'
  | 'approved'
  | 'rejected'

export type ApplicationPhoto = {
  id: string
  storagePath: string
  isPrimary: boolean
  facePhotoConfirmed: boolean
}

export type ApplicationDraft = {
  version: 2
  step: number
  profile: {
    firstName: string
    lastName: string
    displayName: string
    dateOfBirth: string
    gender: string
    pronouns: string
    lookingFor: string
    /** Dedicated public bio shown as About Me on the member profile. */
    aboutMe: string
    /** Canonical intents for filters/badges (networking, dating, friends). */
    connectionIntents: MemberPublicIntentValue[]
    connectionsOpenTo: string[]
  }
  location: {
    city: string
    state: string
    zipCode: string
    neighborhoodOrArea: string
    livesInHuntsvilleArea: boolean | null
    localConnection: string
    socialLink: string
  }
  workAndInterests: {
    occupation: string
    industry: string
    employerCompany: string
    education: string
    interests: string[]
    lifestyleTags: string[]
    eventInterests: string[]
    socialVibe: string
  }
  prompts: {
    bringsYouHere: string
    hopingToMeet: string
    perfectWeekend: string
    favoriteLocalActivities: string
    icebreaker: string
    /** @deprecated Legacy — migrated on read, not shown in form */
    intoLately: string
    /** @deprecated Legacy — migrated on read, not shown in form */
    valueInCommunity: string
  }
  photos: ApplicationPhoto[]
  agreements: {
    codeOfConduct: boolean
    informationAccurate: boolean
    approvalRequired: boolean
    verificationConsent: boolean
  }
}

type LegacyApplicationDraft = {
  step?: number
  fullName?: string
  membershipIntent?: string
  locationArea?: string
  referralSource?: string
  acknowledgements?: boolean
}

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'needs_info',
  'approved',
  'rejected',
]

export const QUEUE_STATUSES: ApplicationStatus[] = [
  'submitted',
  'in_review',
  'needs_info',
  'draft',
  'rejected',
]

export function applicationStatusLabel(status: ApplicationStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'submitted':
      return 'Submitted'
    case 'in_review':
      return 'In review'
    case 'needs_info':
      return 'Needs info'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

export function resolveApplicationStatus(
  profile: {
    application_status?: string | null
    role?: string | null
  } | null
): ApplicationStatus {
  const raw = profile?.application_status
  if (
    raw === 'draft' ||
    raw === 'submitted' ||
    raw === 'in_review' ||
    raw === 'needs_info' ||
    raw === 'approved' ||
    raw === 'rejected'
  ) {
    return raw
  }

  if (profile?.role === 'admin' || profile?.role === 'host') {
    return 'approved'
  }

  return 'draft'
}

export function isApprovedMember(
  status: ApplicationStatus,
  role: string
): boolean {
  if (role === 'admin' || role === 'host') return true
  return status === 'approved'
}

export function appearsInMemberDiscovery(
  status: ApplicationStatus
): boolean {
  return status === 'approved'
}

export function canEditApplication(status: ApplicationStatus): boolean {
  return (
    status === 'draft' ||
    status === 'needs_info' ||
    status === 'rejected'
  )
}

/** Status tracking is useful after submit/review — not on a first unsubmitted draft. */
export function showApplicationStatusTracking(
  status: ApplicationStatus
): boolean {
  return (
    status === 'submitted' ||
    status === 'in_review' ||
    status === 'needs_info' ||
    status === 'rejected'
  )
}

/** Reviewer-requested updates — not the first-draft “Complete your application” card. */
export function showApplicationReviewActionCard(
  status: ApplicationStatus
): boolean {
  return status === 'needs_info' || status === 'rejected'
}

export function canSubmitApplication(status: ApplicationStatus): boolean {
  return status === 'draft' || status === 'needs_info'
}

export function nextActionForApplicant(status: ApplicationStatus): {
  title: string
  description: string
  cta: string
  href: string
} {
  switch (status) {
    case 'draft':
      return {
        title: 'Complete your application',
        description:
          'Save progress at any time. Submit when you are ready for membership review.',
        cta: 'Continue application',
        href: '/application#form',
      }
    case 'submitted':
      return {
        title: 'Application submitted',
        description:
          'The membership team will review your application. Track progress on your status page—we will email you when there is an update.',
        cta: 'View status',
        href: '/application/status',
      }
    case 'in_review':
      return {
        title: 'Under review',
        description:
          'Your application is with the review team. No action is required—check your status page for updates.',
        cta: 'View status',
        href: '/application/status',
      }
    case 'needs_info':
      return {
        title: 'More information requested',
        description:
          'Review the notes from the membership team and update your application.',
        cta: 'Update application',
        href: '/application#form',
      }
    case 'rejected':
      return {
        title: 'Application not approved',
        description:
          'You may revise your application as a draft and submit again if you wish.',
        cta: 'Revise application',
        href: '/application#form',
      }
    case 'approved':
      return {
        title: 'Membership approved',
        description:
          'You have full access to events, discovery, and member experiences.',
        cta: 'Go to home',
        href: '/home',
      }
  }
}

export function statusBadgeVariant(
  status: ApplicationStatus
): 'success' | 'warning' | 'danger' | 'muted' | 'accent' | 'default' {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  if (status === 'needs_info') return 'warning'
  if (status === 'in_review' || status === 'submitted') return 'accent'
  return 'muted'
}

export function queueSortRank(status: ApplicationStatus): number {
  switch (status) {
    case 'submitted':
      return 0
    case 'in_review':
      return 1
    case 'needs_info':
      return 2
    case 'draft':
      return 3
    case 'rejected':
      return 4
    default:
      return 5
  }
}

export function emptyDraft(): ApplicationDraft {
  return {
    version: 2,
    step: 1,
    profile: {
      firstName: '',
      lastName: '',
      displayName: '',
      dateOfBirth: '',
      gender: '',
      pronouns: '',
      lookingFor: '',
      aboutMe: '',
      connectionIntents: [],
      connectionsOpenTo: [],
    },
    location: {
      city: '',
      state: 'AL',
      zipCode: '',
      neighborhoodOrArea: '',
      livesInHuntsvilleArea: null,
      localConnection: '',
      socialLink: '',
    },
    workAndInterests: {
      occupation: '',
      industry: '',
      employerCompany: '',
      education: '',
      interests: [],
      lifestyleTags: [],
      eventInterests: [],
      socialVibe: '',
    },
    prompts: {
      bringsYouHere: '',
      hopingToMeet: '',
      perfectWeekend: '',
      favoriteLocalActivities: '',
      icebreaker: '',
      intoLately: '',
      valueInCommunity: '',
    },
    photos: [],
    agreements: {
      codeOfConduct: false,
      informationAccurate: false,
      approvalRequired: false,
      verificationConsent: false,
    },
  }
}

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 1
  return Math.min(Math.max(1, Math.floor(step)), APPLICATION_TOTAL_STEPS)
}

function migrateLegacyDraft(legacy: LegacyApplicationDraft): ApplicationDraft {
  const base = emptyDraft()
  const fullName = (legacy.fullName ?? '').trim()
  const parts = fullName.split(/\s+/).filter(Boolean)

  base.step = clampStep(legacy.step ?? 1)
  base.profile.firstName = parts[0] ?? ''
  base.profile.lastName = parts.slice(1).join(' ')
  base.profile.displayName = fullName
  base.location.neighborhoodOrArea = legacy.locationArea ?? ''
  base.location.localConnection = legacy.referralSource ?? ''
  base.prompts.hopingToMeet = legacy.membershipIntent ?? ''
  base.prompts.bringsYouHere = legacy.membershipIntent ?? ''
  base.agreements.informationAccurate = Boolean(legacy.acknowledgements)
  base.agreements.approvalRequired = Boolean(legacy.acknowledgements)

  return base
}

function migratePromptsFromLegacy(
  prompts: ApplicationDraft['prompts']
): ApplicationDraft['prompts'] {
  const next = { ...prompts }
  if (!next.bringsYouHere.trim() && next.valueInCommunity.trim()) {
    next.bringsYouHere = next.valueInCommunity
  }
  if (!next.icebreaker.trim() && next.intoLately.trim()) {
    next.icebreaker = next.intoLately
  }
  return next
}

function parseString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function parseBooleanOrNull(value: unknown): boolean | null {
  if (value === true) return true
  if (value === false) return false
  return null
}

function parsePhotos(value: unknown): ApplicationPhoto[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const photo = item as Partial<ApplicationPhoto>
      if (
        typeof photo.id !== 'string' ||
        typeof photo.storagePath !== 'string'
      ) {
        return null
      }
      return {
        id: photo.id,
        storagePath: photo.storagePath,
        isPrimary: Boolean(photo.isPrimary),
        facePhotoConfirmed: Boolean(photo.facePhotoConfirmed),
      }
    })
    .filter((photo): photo is ApplicationPhoto => photo !== null)
}

function migrateConnectionIntentsFromLegacy(
  lookingFor: string,
  connectionsOpenTo: string[]
): MemberPublicIntentValue[] {
  if (lookingFor.trim()) {
    const normalized = normalizeDiscoveryIntent(lookingFor)
    if (
      normalized === 'networking' ||
      normalized === 'dating' ||
      normalized === 'friends'
    ) {
      return [normalized]
    }
    if (normalized === 'mixed') {
      return memberPublicIntentsFromConnectionsOpenTo(connectionsOpenTo)
    }
  }
  return memberPublicIntentsFromConnectionsOpenTo(connectionsOpenTo)
}

export function parseApplicationDraft(value: unknown): ApplicationDraft {
  if (!value || typeof value !== 'object') {
    return emptyDraft()
  }

  const raw = value as Record<string, unknown>

  if (raw.version !== 2) {
    return migrateLegacyDraft(raw as LegacyApplicationDraft)
  }

  const base = emptyDraft()
  const profile = (raw.profile as Record<string, unknown>) ?? {}
  const location = (raw.location as Record<string, unknown>) ?? {}
  const work = (raw.workAndInterests as Record<string, unknown>) ?? {}
  const prompts = (raw.prompts as Record<string, unknown>) ?? {}
  const agreements = (raw.agreements as Record<string, unknown>) ?? {}

  const lookingFor = parseString(profile.lookingFor)
  const connectionsOpenTo = parseStringArray(profile.connectionsOpenTo)
  const parsedIntents = parseConnectionIntents(profile.connectionIntents)
  const connectionIntents =
    parsedIntents.length > 0
      ? parsedIntents
      : migrateConnectionIntentsFromLegacy(lookingFor, connectionsOpenTo)

  const hopingToMeet = parseString(prompts.hopingToMeet)
  const aboutMe = parseString(profile.aboutMe)

  return {
    version: 2,
    step: clampStep(typeof raw.step === 'number' ? raw.step : base.step),
    profile: {
      firstName: parseString(profile.firstName),
      lastName: parseString(profile.lastName),
      displayName: parseString(profile.displayName),
      dateOfBirth: parseString(profile.dateOfBirth),
      gender: parseString(profile.gender),
      pronouns: parseString(profile.pronouns),
      lookingFor,
      aboutMe,
      connectionIntents,
      connectionsOpenTo,
    },
    location: {
      city: parseString(location.city),
      state: parseString(location.state, 'AL'),
      zipCode: parseString(location.zipCode),
      neighborhoodOrArea: parseString(location.neighborhoodOrArea),
      livesInHuntsvilleArea: parseBooleanOrNull(location.livesInHuntsvilleArea),
      localConnection: parseString(location.localConnection),
      socialLink: parseString(location.socialLink),
    },
    workAndInterests: {
      occupation: parseString(work.occupation),
      industry: parseString(work.industry),
      employerCompany: parseString(work.employerCompany),
      education: parseString(work.education),
      interests: parseStringArray(work.interests),
      lifestyleTags: parseStringArray(work.lifestyleTags),
      eventInterests: parseStringArray(work.eventInterests),
      socialVibe: parseString(work.socialVibe),
    },
    prompts: migratePromptsFromLegacy({
      bringsYouHere: parseString(prompts.bringsYouHere),
      hopingToMeet,
      perfectWeekend: parseString(prompts.perfectWeekend),
      favoriteLocalActivities: parseString(prompts.favoriteLocalActivities),
      icebreaker: parseString(prompts.icebreaker),
      intoLately: parseString(prompts.intoLately),
      valueInCommunity: parseString(prompts.valueInCommunity),
    }),
    photos: parsePhotos(raw.photos),
    agreements: {
      codeOfConduct: Boolean(agreements.codeOfConduct),
      informationAccurate: Boolean(agreements.informationAccurate),
      approvalRequired: Boolean(agreements.approvalRequired),
      verificationConsent: Boolean(agreements.verificationConsent),
    },
  }
}

/** Fields that must never appear on public member cards. */
export const APPLICATION_PRIVATE_FIELD_KEYS = [
  'lastName',
  'dateOfBirth',
  'city',
  'state',
  'zipCode',
  'employerCompany',
] as const
