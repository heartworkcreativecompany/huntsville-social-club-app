import { parseApplicationDraft } from '@/lib/application'
import {
  isRemoveMemberEmailConfirmation,
  removeMemberConfirmationError,
} from '@/lib/admin/remove-member-confirmation'

export type RemoveMemberGuardResult =
  | { allowed: true }
  | { allowed: false; error: string }

export type RemoveMemberProfile = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  application_draft: unknown
  membership_billing: unknown
}

export function validateRemoveMemberRequest(input: {
  actorId: string
  targetUserId: string
  confirmationText: string
  target: Pick<RemoveMemberProfile, 'id' | 'role' | 'email'> | null
}): RemoveMemberGuardResult {
  if (!input.target) {
    return { allowed: false, error: 'Member not found.' }
  }

  if (
    !isRemoveMemberEmailConfirmation(input.confirmationText, input.target.email)
  ) {
    return {
      allowed: false,
      error: removeMemberConfirmationError(input.target.email),
    }
  }

  if (input.actorId === input.targetUserId) {
    return {
      allowed: false,
      error: 'You cannot remove your own account from this screen.',
    }
  }

  if (input.target.role === 'admin') {
    return {
      allowed: false,
      error: 'Administrator accounts cannot be removed from this action.',
    }
  }

  return { allowed: true }
}

export function collectMemberPhotoStoragePaths(
  profile: Pick<RemoveMemberProfile, 'application_draft'>
): string[] {
  const draft = parseApplicationDraft(profile.application_draft)
  return [
    ...new Set(
      draft.photos.map((photo) => photo.storagePath.trim()).filter(Boolean)
    ),
  ]
}
