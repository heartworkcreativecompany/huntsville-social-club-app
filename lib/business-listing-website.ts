/**
 * Normalize merchant website values for public directory cards.
 * Returns a safe http(s) URL, or null when the value should not be linked.
 */

const HTTP_SCHEME = /^(https?):\/\//i
const ANY_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const PUBLIC_HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

export function normalizeBusinessWebsiteUrl(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  if (ANY_SCHEME.test(trimmed) && !HTTP_SCHEME.test(trimmed)) {
    return null
  }

  const hadHttpScheme = HTTP_SCHEME.test(trimmed)
  const candidate = hadHttpScheme
    ? trimmed
    : `https://${trimmed.replace(/^\/\//, '')}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }

  if (parsed.username || parsed.password) {
    return null
  }

  const hostname = parsed.hostname.replace(/\.$/, '')
  if (!isPublicWebsiteHostname(hostname)) {
    return null
  }

  const host = hostFromCandidate(candidate, parsed)
  const suffix = `${pathnameForHref(parsed.pathname)}${parsed.search}${parsed.hash}`
  return `${parsed.protocol}//${host}${suffix}`
}

function isPublicWebsiteHostname(hostname: string): boolean {
  if (!hostname || hostname === 'localhost') return false
  if (hostname.startsWith('[') && hostname.endsWith(']')) return false
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false
  return PUBLIC_HOSTNAME.test(hostname)
}

function hostFromCandidate(candidate: string, parsed: URL): string {
  const afterScheme = candidate.replace(HTTP_SCHEME, '')
  const hostPart = afterScheme.split(/[/?#]/, 1)[0] ?? ''
  const withoutUserinfo = hostPart.includes('@')
    ? hostPart.slice(hostPart.lastIndexOf('@') + 1)
    : hostPart
  const host = withoutUserinfo.replace(/\.$/, '')
  return host || parsed.host
}

function pathnameForHref(pathname: string): string {
  return pathname === '/' ? '' : pathname
}
