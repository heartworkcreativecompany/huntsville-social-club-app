/**
 * Who may set events.listed_publicly.
 * Hosts and admins can turn the public calendar flag on or off.
 * Every other role saves false, even if the client sends true.
 */

export function isPublicListingManager(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'host'
}

export function resolveListedPublicly(input: {
  role: string | null | undefined
  requested?: boolean | null
}): boolean {
  if (!isPublicListingManager(input.role)) return false
  return input.requested === true
}

export function isMissingListedPubliclyColumnError(
  error: {
    message?: string
    code?: string
    details?: string
    hint?: string
  } | null
    | undefined
): boolean {
  if (!error) return false
  const haystack = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return (
    haystack.includes('listed_publicly') &&
    (haystack.includes('does not exist') ||
      haystack.includes('schema cache') ||
      haystack.includes('could not find'))
  )
}
