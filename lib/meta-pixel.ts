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

/** Non-identifying parameters only. Member and application fields are rejected. */
export type MetaPixelEventParameters = {
  content_category?: string
  content_type?: string
  currency?: string
  status?: string
  value?: number
  num_items?: number
}

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
  'content_category',
  'content_type',
  'currency',
  'status',
  'value',
  'num_items',
])

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
