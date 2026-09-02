/** Permanent status for legacy match-inbox compatibility redirects. */
export const LEGACY_INBOX_REDIRECT_STATUS = 308 as const

export const LEGACY_DATING_INBOX_PATH = '/matches'
export const CANONICAL_DATING_INBOX_PATH = '/matches/dating'
export const LEGACY_FRIENDS_INBOX_PATH = '/friendship/matches'
export const CANONICAL_FRIENDS_INBOX_PATH = '/matches/friends'

export function withIncomingQuery(pathname: string, search: string): string {
  if (!search || search === '?') {
    return pathname
  }

  return `${pathname}${search.startsWith('?') ? search : `?${search}`}`
}

export function searchParamsToQueryString(
  searchParams: Record<string, string | string[] | undefined>
): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item)
      }
    } else {
      query.append(key, value)
    }
  }

  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export function rawSearchFromHeaders(
  getHeader: (name: string) => string | null
): string | null {
  for (const name of ['x-url', 'next-url', 'x-next-url'] as const) {
    const value = getHeader(name)
    if (!value) {
      continue
    }

    try {
      const parsed = value.includes('://')
        ? new URL(value)
        : new URL(value, 'http://n.local')
      return parsed.search
    } catch {
      continue
    }
  }

  const invokeQuery = getHeader('x-invoke-query')
  if (invokeQuery === null) {
    return null
  }

  if (invokeQuery === '') {
    return ''
  }

  try {
    const decoded = decodeURIComponent(invokeQuery)
    return decoded ? `?${decoded}` : ''
  } catch {
    return `?${invokeQuery}`
  }
}

export function incomingSearchString(
  searchParams: Record<string, string | string[] | undefined>,
  getHeader?: (name: string) => string | null
): string {
  if (getHeader) {
    const fromHeaders = rawSearchFromHeaders(getHeader)
    if (fromHeaders !== null) {
      return fromHeaders
    }
  }

  return searchParamsToQueryString(searchParams)
}
