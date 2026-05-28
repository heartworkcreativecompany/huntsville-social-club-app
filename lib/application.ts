export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'needs_info'
  | 'approved'
  | 'rejected'

export type ApplicationDraft = {
  step: number
  fullName: string
  membershipIntent: string
  locationArea: string
  referralSource: string
  acknowledgements: boolean
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

export function canSubmitApplication(status: ApplicationStatus): boolean {
  return (
    status === 'draft' ||
    status === 'needs_info'
  )
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
          'The membership team will review your application. You will be notified when status changes.',
        cta: 'View application',
        href: '/application',
      }
    case 'in_review':
      return {
        title: 'Under review',
        description:
          'Your application is with the review team. No action is required right now.',
        cta: 'View status',
        href: '/application',
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
    step: 1,
    fullName: '',
    membershipIntent: '',
    locationArea: '',
    referralSource: '',
    acknowledgements: false,
  }
}

export function parseApplicationDraft(value: unknown): ApplicationDraft {
  const base = emptyDraft()
  if (!value || typeof value !== 'object') return base

  const draft = value as Partial<ApplicationDraft>
  return {
    step: typeof draft.step === 'number' ? draft.step : base.step,
    fullName: typeof draft.fullName === 'string' ? draft.fullName : base.fullName,
    membershipIntent:
      typeof draft.membershipIntent === 'string'
        ? draft.membershipIntent
        : base.membershipIntent,
    locationArea:
      typeof draft.locationArea === 'string' ? draft.locationArea : base.locationArea,
    referralSource:
      typeof draft.referralSource === 'string'
        ? draft.referralSource
        : base.referralSource,
    acknowledgements: Boolean(draft.acknowledgements),
  }
}
