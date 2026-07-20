export type ContactEmailFields = {
  contact_email?: string | null
  show_contact_email?: boolean | null
}

/** Public contact email shown on member profiles when the member opts in. */
export function publicContactEmail(
  profile: ContactEmailFields | null | undefined
): string | null {
  if (!profile?.show_contact_email) return null
  const trimmed = profile.contact_email?.trim()
  return trimmed || null
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeContactEmailInput(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function validateContactEmailInput(value: string): string | null {
  const normalized = normalizeContactEmailInput(value)
  if (!normalized) return null
  if (!EMAIL_PATTERN.test(normalized)) {
    return 'Enter a valid email address or leave the field blank.'
  }
  return null
}
