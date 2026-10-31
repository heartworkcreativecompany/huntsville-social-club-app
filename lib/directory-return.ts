import {
  directoryHref,
  directoryQueryString,
  parseDirectoryQuery,
  type DirectoryQueryState,
  type MemberDirectorySearchParams,
} from '@/lib/member-directory-query'

const DIRECTORY_PATH = '/members'

/**
 * Profile links carry the directory's known query fields so Back and the
 * profile's directory link can rebuild the same page, search, and browse
 * state. Unknown fields, including any raw return URL, are ignored.
 */
export function memberProfileHref(
  memberId: string,
  state: DirectoryQueryState
): string {
  const id = memberId.trim()
  if (!id || id.includes('/') || id.includes('\\') || id.includes('?') || id.includes('#')) {
    return DIRECTORY_PATH
  }
  return `/members/${encodeURIComponent(id)}${directoryQueryString(state)}`
}

/**
 * Build the directory href from the profile URL's known directory fields.
 * A profile opened with no directory query falls back to /members.
 */
export function directoryBackHref(
  params: MemberDirectorySearchParams
): string {
  const href = directoryHref(DIRECTORY_PATH, parseDirectoryQuery(params))
  return isAllowedDirectoryHref(href) ? href : DIRECTORY_PATH
}

export function isAllowedDirectoryHref(href: string): boolean {
  if (!href.startsWith(`${DIRECTORY_PATH}`) && href !== DIRECTORY_PATH) {
    return false
  }
  if (href.startsWith('//') || href.includes('\\') || href.includes('://')) {
    return false
  }
  if (href !== DIRECTORY_PATH && !href.startsWith(`${DIRECTORY_PATH}?`)) {
    return false
  }
  return true
}
