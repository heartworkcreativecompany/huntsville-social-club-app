type EventProps = Record<string, string | number | boolean>

const ALLOWED_EVENTS = new Set([
  'auth_account_created',
  'auth_sign_in',
  'auth_sign_in_failed',
  'application_started',
  'application_draft_saved',
  'application_submitted',
  'application_approved',
  'member_profile_viewed',
])

function sanitizeProps(props?: EventProps): EventProps | undefined {
  if (!props) return undefined
  const safe: EventProps = {}
  for (const [key, value] of Object.entries(props)) {
    if (
      key.toLowerCase().includes('email') ||
      key.toLowerCase().includes('password') ||
      key.toLowerCase().includes('name')
    ) {
      continue
    }
    safe[key] = value
  }
  return Object.keys(safe).length > 0 ? safe : undefined
}

/** Client-side funnel events — no PII in properties. */
export function trackEvent(name: string, props?: EventProps) {
  if (typeof window === 'undefined') return
  if (!ALLOWED_EVENTS.has(name)) return

  const payload = {
    event: name,
    props: sanitizeProps(props),
    ts: Date.now(),
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('[analytics]', payload)
  }

  try {
    const body = JSON.stringify(payload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics', body)
    } else {
      void fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
    }
  } catch {
    // Analytics must never break UX.
  }
}

/** Server-side funnel events — no PII. */
export function trackServerEvent(name: string, props?: EventProps) {
  if (!ALLOWED_EVENTS.has(name)) return

  if (process.env.NODE_ENV === 'development') {
    console.info('[analytics:server]', name, sanitizeProps(props))
  }
}
