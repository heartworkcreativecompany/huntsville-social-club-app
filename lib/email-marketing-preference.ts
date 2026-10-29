import type { MarketingProviderObservation } from '@/lib/email-marketing-provider-lookup'

export const ACCOUNT_EMAIL_MARKETING_OPT_IN_LABEL =
  'Email me Huntsville Social Club news, event announcements, and offers.'

export const ACCOUNT_EMAIL_MARKETING_OPT_IN_EXPLANATION =
  'This is optional and separate from essential account, application, and membership emails.'

export const EMAIL_MARKETING_PREFERENCE_SAVED =
  'Email preference saved.' as const

export const EMAIL_MARKETING_PREFERENCE_SAVE_ERROR =
  'Could not save your email preference.' as const

export const EMAIL_MARKETING_RESUBSCRIPTION_BLOCKED =
  'You’re currently unsubscribed from marketing emails. We couldn’t turn them back on here. Your preference remains off.' as const

export const EMAIL_MARKETING_PREFERENCE_UNAVAILABLE =
  'We couldn’t check your marketing email status, so your preference was not changed.' as const

export type EmailMarketingPreferenceResult =
  | { success: true }
  | { error: string }
  | { status: 'blocked_resubscription' | 'unavailable' }

export type EmailMarketingPreferencePhase =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'blocked'
  | 'unavailable'

/**
 * Success is shown only after a completed authoritative save.
 * A pending request stays in the saving state even if an older result exists.
 * Blocked and unavailable results are not success.
 */
export function emailMarketingPreferencePhase(input: {
  pending: boolean
  result: EmailMarketingPreferenceResult | null
}): EmailMarketingPreferencePhase {
  if (input.pending) return 'saving'
  if (!input.result) return 'idle'
  if ('success' in input.result && input.result.success === true) return 'saved'
  if ('status' in input.result && input.result.status === 'blocked_resubscription') {
    return 'blocked'
  }
  if ('status' in input.result && input.result.status === 'unavailable') return 'unavailable'
  if ('error' in input.result && input.result.error) return 'error'
  return 'idle'
}

/**
 * The checkbox follows the authoritative preference when the provider
 * blocks resubscription or the lookup cannot be trusted.
 */
export function displayedMarketingOptIn(input: {
  stored: boolean
  draft: boolean
  result: EmailMarketingPreferenceResult | null
}): boolean {
  if (!input.result || !('status' in input.result)) return input.draft
  if (input.result.status === 'blocked_resubscription') return false
  if (input.result.status === 'unavailable') return input.stored
  return input.draft
}

export type AccountMarketingOptInDecision = 'commit' | 'blocked_resubscription' | 'unavailable'

/**
 * The account checkbox is checked only from the local consent record.
 * Provider subscription is not an input and is not documented consent.
 * A missing or unreadable record stays unchecked.
 */
export function localEmailMarketingOptedIn(input: {
  readable: boolean
  emailMarketingOptIn: boolean | null | undefined
  emailMarketingOptedOutAt: string | null | undefined
}): boolean {
  if (!input.readable) return false
  return input.emailMarketingOptIn === true && input.emailMarketingOptedOutAt == null
}

export type AccountMarketingPreferenceView =
  | { available: false }
  | { available: true; optedIn: boolean }

/**
 * A failed consent read hides the preference controls.
 * It is not rendered as a confirmed opt-out, so the member cannot save
 * from an unavailable record.
 */
export function accountMarketingPreferenceView(input: {
  readFailed: boolean
  emailMarketingOptIn: boolean | null | undefined
  emailMarketingOptedOutAt: string | null | undefined
}): AccountMarketingPreferenceView {
  if (input.readFailed) return { available: false }
  return {
    available: true,
    optedIn: localEmailMarketingOptedIn({
      readable: true,
      emailMarketingOptIn: input.emailMarketingOptIn,
      emailMarketingOptedOutAt: input.emailMarketingOptedOutAt,
    }),
  }
}

/**
 * Missing and subscribed contacts can be enrolled by the existing worker.
 * Unsubscribed refuses resubscription. Any other observation, including a
 * failed lookup, does not guess that resubscription is allowed.
 */
export function accountMarketingOptInDecision(
  provider: MarketingProviderObservation
): AccountMarketingOptInDecision {
  if (provider === 'unsubscribed') return 'blocked_resubscription'
  if (provider === 'missing' || provider === 'subscribed') return 'commit'
  return 'unavailable'
}

type PreferenceWrite =
  | { status: 'opted_out' }
  | { status: 'opted_in' }
  | { status: 'blocked_resubscription' }
  | { status: 'unavailable' }
  | { error: string }

/**
 * Opt-out does not consult the provider.
 * Opt-in records checkedAt before the lookup. The database commit uses that
 * timestamp so a withdrawal that arrives during the lookup is not cleared.
 */
export async function completeAccountMarketingPreference(input: {
  signedIn: boolean
  email: string | null
  optIn: boolean
  now?: () => string
  lookup: (email: string) => Promise<MarketingProviderObservation>
  /** True, false, or null when the local record cannot be read. */
  readLocallyOptedIn: () => Promise<boolean | null>
  withdraw: () => Promise<Extract<PreferenceWrite, { status: 'opted_out' } | { error: string }>>
  commit: (
    checkedAt: string
  ) => Promise<
    Extract<
      PreferenceWrite,
      { status: 'opted_in' | 'blocked_resubscription' | 'unavailable' } | { error: string }
    >
  >
}): Promise<EmailMarketingPreferenceResult> {
  if (!input.signedIn) return { error: 'You must be signed in.' }
  if (input.optIn !== true && input.optIn !== false) {
    return { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR }
  }

  let locallyOptedIn: boolean | null = null
  try {
    locallyOptedIn = await input.readLocallyOptedIn()
  } catch {
    locallyOptedIn = null
  }

  if (input.optIn === false) {
    if (locallyOptedIn === false) return { success: true }
    const saved = await input.withdraw()
    if ('error' in saved) return { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR }
    return { success: true }
  }

  const checkedAt = (input.now ?? (() => new Date().toISOString()))()
  let provider: MarketingProviderObservation = 'unavailable'
  if (input.email) {
    try {
      const observed = await input.lookup(input.email)
      if (
        observed === 'missing' ||
        observed === 'subscribed' ||
        observed === 'unsubscribed' ||
        observed === 'unavailable'
      ) {
        provider = observed
      }
    } catch {
      provider = 'unavailable'
    }
  }

  const decision = accountMarketingOptInDecision(provider)
  if (decision === 'blocked_resubscription') {
    if (locallyOptedIn !== false) {
      const saved = await input.withdraw()
      if ('error' in saved) return { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR }
    }
    return { status: 'blocked_resubscription' }
  }
  if (decision !== 'commit') return { status: 'unavailable' }
  if (locallyOptedIn === true) return { success: true }

  const committed = await input.commit(checkedAt)
  if ('error' in committed) return { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR }
  if (committed.status === 'opted_in') return { success: true }
  if (committed.status === 'blocked_resubscription') return { status: 'blocked_resubscription' }
  return { status: 'unavailable' }
}
