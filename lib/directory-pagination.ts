export const MEMBER_DIRECTORY_PAGE_SIZE = 9

export type DirectoryPageToken = number | 'ellipsis'

export function directoryPageCount(
  total: number,
  pageSize = MEMBER_DIRECTORY_PAGE_SIZE
): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.ceil(total / pageSize)
}

/** Invalid, zero, and negative values become page 1. */
export function parseDirectoryPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return 1
  const page = Number(raw)
  if (!Number.isSafeInteger(page)) return 1
  return page
}

export function clampDirectoryPage(
  page: number,
  total: number,
  pageSize = MEMBER_DIRECTORY_PAGE_SIZE
): number {
  const pages = directoryPageCount(total, pageSize)
  if (pages === 0) return 1
  if (!Number.isFinite(page) || page < 1) return 1
  if (page > pages) return pages
  return Math.floor(page)
}

export function directorySlice<T>(
  items: readonly T[],
  page: number,
  pageSize = MEMBER_DIRECTORY_PAGE_SIZE
): T[] {
  const safePage = clampDirectoryPage(page, items.length, pageSize)
  const start = (safePage - 1) * pageSize
  return items.slice(start, start + pageSize)
}

export function directoryResultSummary(
  page: number,
  total: number,
  pageSize = MEMBER_DIRECTORY_PAGE_SIZE
): string {
  if (total <= 0) return 'Showing 0 members.'
  const safePage = clampDirectoryPage(page, total, pageSize)
  const start = (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, total)
  const noun = total === 1 ? 'member' : 'members'
  return `Showing ${start}–${end} of ${total} ${noun}.`
}

/**
 * Compact page list: every page when there are 7 or fewer, otherwise the
 * first, last, and current page with its neighbors, separated by ellipses.
 */
export function directoryPageTokens(
  current: number,
  pageCount: number
): DirectoryPageToken[] {
  if (pageCount <= 1) return []
  const page = Math.min(Math.max(Math.floor(current) || 1, 1), pageCount)
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const included = new Set<number>([1, pageCount, page])
  for (const neighbor of [page - 1, page + 1]) {
    if (neighbor > 1 && neighbor < pageCount) included.add(neighbor)
  }

  const sorted = [...included].sort((left, right) => left - right)
  const tokens: DirectoryPageToken[] = []
  let previous = 0
  for (const value of sorted) {
    if (previous > 0 && value - previous > 1) tokens.push('ellipsis')
    tokens.push(value)
    previous = value
  }
  return tokens
}
