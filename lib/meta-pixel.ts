const PIXEL_ID_PATTERN = /^\d{15,16}$/

const META_PIXEL_EVENTS = [
  'PageView',
  'ViewContent',
  'Search',
  'Lead',
  'CompleteRegistration',
  'Contact',
] as const

export type MetaPixelEventName = (typeof META_PIXEL_EVENTS)[number]

/** Fixed label for the membership application. Not a member or applicant name. */
export const HSC_APPLICATION_CONTENT_NAME = 'HSC Application'

export const HSC_APPLICATION_CONTENT_CATEGORY = 'Membership Application'

/** Non-identifying parameters only. Member and application fields are rejected. */
export type MetaPixelEventParameters = {
  content_name?: typeof HSC_APPLICATION_CONTENT_NAME
  content_category?: string
  content_type?: string
  currency?: string
  status?: string
  value?: number
  num_items?: number
}

export const HSC_APPLICATION_CONTENT = {
  content_name: HSC_APPLICATION_CONTENT_NAME,
  content_category: HSC_APPLICATION_CONTENT_CATEGORY,
} as const satisfies MetaPixelEventParameters

/** Harmless dedupe flags. Values are only "1" and contain no member data. */
export const META_APPLICATION_DEDUPE_KEYS = {
  viewContent: 'hsc.meta.application.view-content',
  lead: 'hsc.meta.application.lead',
  completeRegistration: 'hsc.meta.application.complete-registration',
} as const

export type MetaPixelEventOptions = {
  /** Opaque deduplication id. Not an email, phone, or member id. */
  eventID?: string
  parameters?: MetaPixelEventParameters
}

type FacebookPixel = {
  (command: 'init', pixelId: string): void
  (
    command: 'track',
    eventName: string,
    parameters?: Record<string, string | number>,
    options?: { eventID: string },
  ): void
  callMethod?: (...args: unknown[]) => void
  queue?: unknown[]
  loaded?: boolean
  version?: string
  push?: FacebookPixel
}

declare global {
  interface Window {
    fbq?: FacebookPixel
    _fbq?: FacebookPixel
  }
}

const ALLOWED_EVENTS = new Set<string>(META_PIXEL_EVENTS)

const ALLOWED_PARAMETER_KEYS = new Set<keyof MetaPixelEventParameters>([
  'content_name',
  'content_category',
  'content_type',
  'currency',
  'status',
  'value',
  'num_items',
])

const claimedDedupeKeys = new Set<string>()

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/** Website pixel ID from NEXT_PUBLIC_META_PIXEL_ID. Null when unset or invalid. */
export function metaPixelId(): string | null {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim()
  if (!id || !PIXEL_ID_PATTERN.test(id)) return null
  return id
}

/** Official Meta bootstrap. Initializes fbq and does not send a PageView. */
export function metaPixelScript(pixelId: string): string | null {
  if (!PIXEL_ID_PATTERN.test(pixelId)) return null
  return `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');`
}

function looksSensitive(value: string) {
  return value.includes('@') || value.replace(/\D/g, '').length >= 7
}

function sanitizeParameters(
  parameters: MetaPixelEventParameters | undefined,
): Record<string, string | number> | undefined {
  if (!parameters) return undefined
  const safe: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(parameters)) {
    if (!ALLOWED_PARAMETER_KEYS.has(key as keyof MetaPixelEventParameters)) continue
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value
      continue
    }
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || looksSensitive(trimmed)) continue
    if (key === 'content_name' && trimmed !== HSC_APPLICATION_CONTENT_NAME) continue
    safe[key] = trimmed
  }
  return Object.keys(safe).length > 0 ? safe : undefined
}

function sanitizeEventId(eventID: string | undefined) {
  if (!eventID || !EVENT_ID_PATTERN.test(eventID)) return undefined
  return eventID
}

function fbqReady() {
  return typeof window !== 'undefined' && typeof window.fbq === 'function' && metaPixelId() !== null
}

/** Standard website event. No-ops without a browser, pixel ID, or fbq. */
export function event(name: MetaPixelEventName, options?: MetaPixelEventOptions) {
  if (!ALLOWED_EVENTS.has(name) || !fbqReady()) return
  const parameters = sanitizeParameters(options?.parameters)
  const eventID = sanitizeEventId(options?.eventID)
  const fbq = window.fbq
  if (!fbq) return
  if (eventID && parameters) {
    fbq('track', name, parameters, { eventID })
    return
  }
  if (eventID) {
    fbq('track', name, {}, { eventID })
    return
  }
  if (parameters) {
    fbq('track', name, parameters)
    return
  }
  fbq('track', name)
}

export function pageview() {
  event('PageView')
}

function readDedupeFlag(key: string) {
  try {
    return window.sessionStorage.getItem(key) === '1'
  } catch {
    return claimedDedupeKeys.has(key)
  }
}

function writeDedupeFlag(key: string) {
  claimedDedupeKeys.add(key)
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {
    // The in-memory claim still blocks a remount in this page session.
  }
}

/** Clears in-memory dedupe claims. Browser tests call this between cases. */
export function clearMetaPixelDedupeForTests() {
  claimedDedupeKeys.clear()
}

function sendWhenPixelReady(send: () => void) {
  if (fbqReady()) {
    send()
    return
  }
  let tries = 0
  const timer = window.setInterval(() => {
    tries += 1
    if (fbqReady()) {
      window.clearInterval(timer)
      send()
      return
    }
    if (tries >= 25) window.clearInterval(timer)
  }, 200)
}

function trackApplicationEvent(key: string, send: () => void) {
  if (typeof window === 'undefined' || !metaPixelId()) return
  if (claimedDedupeKeys.has(key) || readDedupeFlag(key)) {
    claimedDedupeKeys.add(key)
    return
  }
  writeDedupeFlag(key)
  sendWhenPixelReady(send)
}

/** Once per browser session when /signup, the public application start page, is viewed. */
export function trackApplicationViewContent() {
  trackApplicationEvent(META_APPLICATION_DEDUPE_KEYS.viewContent, () => {
    event('ViewContent', { parameters: HSC_APPLICATION_CONTENT })
  })
}

/** Once per browser session after account creation succeeds. No event parameters. */
export function trackApplicationLead() {
  trackApplicationEvent(META_APPLICATION_DEDUPE_KEYS.lead, () => {
    event('Lead')
  })
}

/** True only for the persisted-success result from submitApplication. */
export function applicationSubmitSucceeded(result: {
  success?: boolean
  error?: string
}): result is { success: true } {
  return result.success === true && typeof result.error !== 'string'
}

const COMPLETE_REGISTRATION_WAIT_MS = 300

function sendCompleteRegistration() {
  const key = META_APPLICATION_DEDUPE_KEYS.completeRegistration
  if (claimedDedupeKeys.has(key) || readDedupeFlag(key)) {
    claimedDedupeKeys.add(key)
    return 'skipped' as const
  }
  if (!fbqReady()) return 'waiting' as const
  event('CompleteRegistration', { parameters: HSC_APPLICATION_CONTENT })
  writeDedupeFlag(key)
  return 'sent' as const
}

/**
 * Queues CompleteRegistration after the application is persisted.
 * The session flag is written only after fbq is called.
 * Resolves on the next timer turn after a successful call so navigation
 * does not start in the same turn as the pixel queue.
 */
export function trackApplicationCompleteRegistration(): Promise<boolean> {
  if (typeof window === 'undefined' || !metaPixelId()) return Promise.resolve(false)

  const immediate = sendCompleteRegistration()
  if (immediate === 'skipped') return Promise.resolve(false)
  if (immediate === 'sent') {
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(true), 0)
    })
  }

  return new Promise((resolve) => {
    const started = Date.now()
    const timer = window.setInterval(() => {
      const attempt = sendCompleteRegistration()
      if (attempt === 'sent') {
        window.clearInterval(timer)
        window.setTimeout(() => resolve(true), 0)
        return
      }
      if (attempt === 'skipped' || Date.now() - started >= COMPLETE_REGISTRATION_WAIT_MS) {
        window.clearInterval(timer)
        resolve(false)
      }
    }, 50)
  })
}
