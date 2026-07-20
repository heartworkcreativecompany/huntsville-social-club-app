export function isRemoveMemberEmailConfirmation(
  confirmationText: string,
  memberEmail: string | null | undefined
): boolean {
  const email = memberEmail?.trim()
  if (!email) {
    return false
  }

  return confirmationText.trim() === email
}

export function removeMemberConfirmationLabel(
  memberEmail: string | null | undefined
): string {
  const email = memberEmail?.trim()
  if (!email) {
    return 'This member has no email on file.'
  }

  return `Type this member's email to confirm removal: ${email}`
}

export function removeMemberConfirmationError(
  memberEmail: string | null | undefined
): string {
  const email = memberEmail?.trim()
  if (!email) {
    return 'This member has no email on file. Removal cannot be confirmed.'
  }

  return removeMemberConfirmationLabel(email)
}
