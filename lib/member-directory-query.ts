import {
  DEFAULT_DIRECTORY_BROWSE_STATE,
  normalizeDirectoryNameQuery,
  parseDirectoryBrowseState,
  type DirectoryBrowseState,
} from '@/lib/members-discovery'
import { parseDirectoryPage } from '@/lib/directory-pagination'

export type MemberDirectorySearchParams = Record<
  string,
  string | string[] | undefined
>

export type DirectoryQueryState = {
  search: string
  browse: DirectoryBrowseState
  page: number
}

function firstParam(
  params: MemberDirectorySearchParams,
  key: string
): string | undefined {
  const value = params[key]
  if (Array.isArray(value)) return value[0]
  return value
}

export function parseDirectoryQuery(
  params: MemberDirectorySearchParams
): DirectoryQueryState {
  return {
    search: normalizeDirectoryNameQuery(firstParam(params, 'q')),
    browse: parseDirectoryBrowseState({
      browseMode: firstParam(params, 'browse'),
      intentFilter: firstParam(params, 'intent'),
      industryFilter: firstParam(params, 'industry'),
    }),
    page: parseDirectoryPage(firstParam(params, 'page')),
  }
}

export function directoryQueryString(state: DirectoryQueryState): string {
  const params = new URLSearchParams()
  const search = normalizeDirectoryNameQuery(state.search)
  const browse = parseDirectoryBrowseState(state.browse)
  if (search) params.set('q', search)
  if (browse.browseMode !== DEFAULT_DIRECTORY_BROWSE_STATE.browseMode) {
    params.set('browse', browse.browseMode)
  }
  if (browse.browseMode === 'intentions' && browse.intentFilter !== 'all') {
    params.set('intent', browse.intentFilter)
  }
  if (browse.browseMode === 'industry' && browse.industryFilter !== 'all') {
    params.set('industry', browse.industryFilter)
  }
  if (state.page > 1) params.set('page', String(state.page))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function directoryHref(
  pathname: string,
  state: DirectoryQueryState
): string {
  return `${pathname}${directoryQueryString(state)}`
}

/** Intention and industry filters can still come from application drafts. */
export function directoryBrowseNeedsEnrichedRoster(
  state: DirectoryBrowseState
): boolean {
  const browse = parseDirectoryBrowseState(state)
  if (browse.browseMode === 'industry') return true
  return browse.intentFilter !== 'all'
}

/** Literal substring for Postgres ILIKE. `%` and `_` are escaped. */
export function directoryNameIlikePattern(search: string): string {
  const escaped = normalizeDirectoryNameQuery(search)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
  return `%${escaped}%`
}
