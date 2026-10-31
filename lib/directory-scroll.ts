export const DIRECTORY_SCROLL_STORAGE_KEY = 'hsc-directory-return-scroll'

export type DirectoryScrollMark = {
  href: string
  cardId: string
  scrollTop: number
}

export function currentDirectoryHref(location: {
  pathname: string
  search: string
}): string {
  return `${location.pathname}${location.search}`
}

function isInternalScrollHref(href: string): boolean {
  return (
    href.startsWith('/') &&
    !href.startsWith('//') &&
    !href.includes('\\') &&
    !href.includes('://')
  )
}

export function parseDirectoryScrollMark(raw: string | null): DirectoryScrollMark | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<DirectoryScrollMark>
    if (
      typeof parsed.href !== 'string' ||
      !isInternalScrollHref(parsed.href) ||
      typeof parsed.cardId !== 'string' ||
      parsed.cardId.length === 0 ||
      parsed.cardId.length > 200 ||
      typeof parsed.scrollTop !== 'number' ||
      !Number.isFinite(parsed.scrollTop) ||
      parsed.scrollTop < 0
    ) {
      return null
    }
    return {
      href: parsed.href,
      cardId: parsed.cardId,
      scrollTop: parsed.scrollTop,
    }
  } catch {
    return null
  }
}

export function writeDirectoryScrollMark(
  storage: { setItem(key: string, value: string): void } | null,
  mark: DirectoryScrollMark
): boolean {
  try {
    storage?.setItem(DIRECTORY_SCROLL_STORAGE_KEY, JSON.stringify(mark))
    return true
  } catch {
    return false
  }
}

export function readDirectoryScrollRaw(
  storage: { getItem(key: string): string | null } | null
): string | null {
  try {
    return storage?.getItem(DIRECTORY_SCROLL_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

export function clearDirectoryScrollMark(
  storage: { removeItem(key: string): void } | null
): void {
  try {
    storage?.removeItem(DIRECTORY_SCROLL_STORAGE_KEY)
  } catch {
    // A blocked storage API must not stop directory navigation.
  }
}

export function directoryScrollMarkForHref(
  raw: string | null,
  href: string
): DirectoryScrollMark | null {
  const mark = parseDirectoryScrollMark(raw)
  if (!mark || mark.href !== href) return null
  return mark
}
