/**
 * Read-only classification of a Resend contact lookup.
 * This does not create, update, or email a contact.
 * A missing boolean or a failed response is unavailable, not subscribed.
 */
export type MarketingProviderObservation =
  | 'missing'
  | 'subscribed'
  | 'unsubscribed'
  | 'unavailable'

const RESEND_CONTACTS_URL = 'https://api.resend.com/contacts'

export function classifyMarketingProviderLookup(input: {
  status: number
  unsubscribed?: unknown
}): MarketingProviderObservation {
  if (input.status === 404) return 'missing'
  if (input.status < 200 || input.status >= 300) return 'unavailable'
  if (input.unsubscribed === true) return 'unsubscribed'
  if (input.unsubscribed === false) return 'subscribed'
  return 'unavailable'
}

export async function lookupMarketingProviderContact(input: {
  email: string
  apiKey: string | undefined
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<MarketingProviderObservation> {
  const apiKey = input.apiKey?.trim()
  const email = input.email.trim()
  if (!apiKey || !email) return 'unavailable'

  const fetchImpl = input.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(`${RESEND_CONTACTS_URL}/${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: input.signal ?? AbortSignal.timeout(8000),
    })
    let unsubscribed: unknown
    if (response.status !== 404) {
      const text = await response.text()
      if (text) {
        try {
          unsubscribed = (JSON.parse(text) as { unsubscribed?: unknown }).unsubscribed
        } catch {
          return 'unavailable'
        }
      }
    }
    return classifyMarketingProviderLookup({
      status: response.status,
      unsubscribed,
    })
  } catch {
    return 'unavailable'
  }
}
