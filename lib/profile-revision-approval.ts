import {
  parseApprovalGates,
  verificationStateFromGates,
  parseVerificationState,
  type ApprovalGates,
} from '@/lib/membership-systems'
import { photosEqual, photosRevisionChanged } from '@/lib/profile-revision'
import type { ApplicationPhoto } from '@/lib/application'
import type { ProfilePendingRevision } from '@/lib/profile-revision'

export function approvalGatesAfterRevisionSubmit(
  existingGates: unknown,
  livePhotos: ApplicationPhoto[],
  nextPhotos: ApplicationPhoto[]
): ApprovalGates {
  const gates = parseApprovalGates(existingGates)
  if (photosEqual(livePhotos, nextPhotos)) {
    return gates
  }
  return {
    ...gates,
    photos_reviewed: 'pending_review',
  }
}

export function approvalGatesAfterRevisionApprove(
  existingGates: unknown,
  pending: ProfilePendingRevision,
  livePhotos: ApplicationPhoto[]
): ApprovalGates {
  const gates = parseApprovalGates(existingGates)
  if (!photosRevisionChanged(livePhotos, pending.photos)) {
    return gates
  }
  const next = {
    ...gates,
    photos_reviewed: 'approved' as const,
  }
  return next
}

export function verificationStateAfterRevisionApprove(
  gates: ApprovalGates,
  existingVerification: unknown
) {
  return verificationStateFromGates(
    gates,
    parseVerificationState(existingVerification)
  )
}
