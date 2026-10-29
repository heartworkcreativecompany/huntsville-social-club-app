import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { decideEmailMarketingSync } from '@/lib/email-marketing-sync'
import {
  classifyMarketingProviderLookup,
  lookupMarketingProviderContact,
} from '@/lib/email-marketing-provider-lookup'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}))

import EmailMarketingPreferenceCard, {
  EmailMarketingPreferenceFeedback,
} from '@/components/profile/email-marketing-preference-card'
import { SUPPORT_EMAIL } from '@/lib/site'
import {
  ACCOUNT_EMAIL_MARKETING_OPT_IN_EXPLANATION,
  ACCOUNT_EMAIL_MARKETING_OPT_IN_LABEL,
  completeAccountMarketingPreference,
  displayedMarketingOptIn,
  localEmailMarketingOptedIn,
  EMAIL_MARKETING_PREFERENCE_SAVED,
  EMAIL_MARKETING_PREFERENCE_SAVE_ERROR,
  EMAIL_MARKETING_PREFERENCE_UNAVAILABLE,
  EMAIL_MARKETING_RESUBSCRIPTION_BLOCKED,
  emailMarketingPreferencePhase,
} from '@/lib/email-marketing-preference'

describe('email marketing preference phase', () => {
  it('stays idle before a save and does not treat the stored opt-in as a new success', () => {
    expect(emailMarketingPreferencePhase({ pending: false, result: null })).toBe('idle')
  })

  it('shows saving while the request is pending, even after an older success', () => {
    expect(
      emailMarketingPreferencePhase({
        pending: true,
        result: { success: true },
      })
    ).toBe('saving')
  })

  it('shows success only after an authoritative save', () => {
    expect(
      emailMarketingPreferencePhase({
        pending: false,
        result: { success: true },
      })
    ).toBe('saved')
  })

  it('shows failure without a success state', () => {
    const result = {
      pending: false,
      result: { error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR },
    } as const
    expect(emailMarketingPreferencePhase(result)).toBe('error')
    expect(emailMarketingPreferencePhase(result)).not.toBe('saved')
  })

  it('does not show success when resubscription is blocked or the provider cannot be checked', () => {
    expect(
      emailMarketingPreferencePhase({
        pending: false,
        result: { status: 'blocked_resubscription' },
      })
    ).toBe('blocked')
    expect(
      emailMarketingPreferencePhase({
        pending: false,
        result: { status: 'unavailable' },
      })
    ).toBe('unavailable')
    expect(
      emailMarketingPreferencePhase({
        pending: true,
        result: { status: 'blocked_resubscription' },
      })
    ).toBe('saving')
  })
})

describe('email marketing preference card', () => {
  it('initializes the checkbox from stored consent and explains the optional choice', () => {
    const optedIn = renderToStaticMarkup(
      createElement(EmailMarketingPreferenceCard, { optedIn: true })
    )
    const optedOut = renderToStaticMarkup(
      createElement(EmailMarketingPreferenceCard, { optedIn: false })
    )

    expect(optedIn).toContain(ACCOUNT_EMAIL_MARKETING_OPT_IN_LABEL)
    expect(optedIn).toContain(ACCOUNT_EMAIL_MARKETING_OPT_IN_EXPLANATION)
    expect(optedIn).toContain('checked')
    expect(optedOut).not.toContain('checked')
    expect(optedIn).not.toContain(EMAIL_MARKETING_PREFERENCE_SAVED)
    expect(optedIn).not.toContain(EMAIL_MARKETING_RESUBSCRIPTION_BLOCKED)
    expect(optedIn).toContain('Save email preference')
    expect(optedIn).toContain('for="email-marketing-opt-in"')
    expect(optedIn).toContain('id="email-marketing-opt-in"')
  })

  it('shows the blocked, unavailable, and failed states without a success message', () => {
    const blocked = renderToStaticMarkup(
      createElement(EmailMarketingPreferenceFeedback, { phase: 'blocked' })
    )
    const unavailable = renderToStaticMarkup(
      createElement(EmailMarketingPreferenceFeedback, { phase: 'unavailable' })
    )
    const failed = renderToStaticMarkup(
      createElement(EmailMarketingPreferenceFeedback, {
        phase: 'error',
        error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR,
      })
    )

    expect(blocked).toContain(EMAIL_MARKETING_RESUBSCRIPTION_BLOCKED)
    expect(blocked).toContain(`mailto:${SUPPORT_EMAIL}`)
    expect(blocked).toContain(SUPPORT_EMAIL)
    expect(blocked).not.toContain(EMAIL_MARKETING_PREFERENCE_SAVED)
    expect(blocked).not.toContain('resubscribe')
    expect(unavailable).toContain(EMAIL_MARKETING_PREFERENCE_UNAVAILABLE)
    expect(unavailable).toContain(`mailto:${SUPPORT_EMAIL}`)
    expect(unavailable).not.toContain(EMAIL_MARKETING_PREFERENCE_SAVED)
    expect(failed).toContain(EMAIL_MARKETING_PREFERENCE_SAVE_ERROR)
    expect(failed).not.toContain(EMAIL_MARKETING_PREFERENCE_SAVED)
    expect(blocked).toContain('role="alert"')
    expect(unavailable).toContain('role="alert"')
    expect(failed).toContain('role="alert"')
    const saved = renderToStaticMarkup(
      createElement(EmailMarketingPreferenceFeedback, { phase: 'saved' })
    )
    expect(saved).toContain('role="status"')
    expect(saved).toContain(EMAIL_MARKETING_PREFERENCE_SAVED)
    expect(saved).not.toContain('role="alert"')
  })

  it('keeps the checkbox off after a blocked resubscription and unchanged when lookup is unavailable', () => {
    expect(
      displayedMarketingOptIn({
        stored: true,
        draft: true,
        result: { status: 'blocked_resubscription' },
      })
    ).toBe(false)
    expect(
      displayedMarketingOptIn({
        stored: false,
        draft: true,
        result: { status: 'unavailable' },
      })
    ).toBe(false)
    expect(
      displayedMarketingOptIn({
        stored: true,
        draft: false,
        result: { status: 'unavailable' },
      })
    ).toBe(true)
  })
})

describe('local marketing checkbox', () => {
  it('renders an existing local opt-in as checked and a local opt-out as unchecked', () => {
    expect(
      localEmailMarketingOptedIn({
        readable: true,
        emailMarketingOptIn: true,
        emailMarketingOptedOutAt: null,
      })
    ).toBe(true)
    const checked = renderToStaticMarkup(
      createElement(EmailMarketingPreferenceCard, { optedIn: true })
    )
    expect(checked).toContain('checked')

    expect(
      localEmailMarketingOptedIn({
        readable: true,
        emailMarketingOptIn: false,
        emailMarketingOptedOutAt: '2026-01-01T00:00:00.000Z',
      })
    ).toBe(false)
    expect(
      localEmailMarketingOptedIn({
        readable: true,
        emailMarketingOptIn: true,
        emailMarketingOptedOutAt: '2026-01-01T00:00:00.000Z',
      })
    ).toBe(false)
    const unchecked = renderToStaticMarkup(
      createElement(EmailMarketingPreferenceCard, { optedIn: false })
    )
    expect(unchecked).not.toContain('checked')
  })

  it('does not treat a subscribed provider as local consent', () => {
    const providerSubscribed = 'subscribed' as const
    expect(providerSubscribed).toBe('subscribed')
    expect(
      localEmailMarketingOptedIn({
        readable: true,
        emailMarketingOptIn: false,
        emailMarketingOptedOutAt: null,
      })
    ).toBe(false)
    const page = readFileSync('app/(club)/profile/page.tsx', 'utf8')
    expect(page).toContain('localEmailMarketingOptedIn')
    expect(page).toContain('email_marketing_opt_in, email_marketing_opted_out_at')
    expect(page).not.toContain('lookupMarketingProviderContact')
  })
})

describe('account marketing opt-in decision', () => {
  const ports = () => {
    const calls: string[] = []
    return {
      calls,
      lookup: async () => 'subscribed' as const,
      readLocallyOptedIn: async () => false,
      withdraw: async () => {
        calls.push('withdraw')
        return { status: 'opted_out' as const }
      },
      commit: async (checkedAt: string) => {
        calls.push(`commit:${checkedAt}`)
        return { status: 'opted_in' as const }
      },
    }
  }

  it('opts out without asking the provider', async () => {
    let lookedUp = false
    const result = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: false,
      lookup: async () => {
        lookedUp = true
        return 'unsubscribed'
      },
      readLocallyOptedIn: async () => true,
      withdraw: async () => ({ status: 'opted_out' }),
      commit: async () => ({ status: 'opted_in' }),
    })
    expect(result).toEqual({ success: true })
    expect(lookedUp).toBe(false)
  })

  it('does not report opt-in success when the provider is unsubscribed', async () => {
    const seen: string[] = []
    const result = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      now: () => '2026-10-29T18:00:00.000Z',
      lookup: async () => 'unsubscribed',
      readLocallyOptedIn: async () => true,
      withdraw: async () => {
        seen.push('withdraw')
        return { status: 'opted_out' }
      },
      commit: async () => {
        seen.push('commit')
        return { status: 'opted_in' }
      },
    })
    expect(result).toEqual({ status: 'blocked_resubscription' })
    expect(result).not.toHaveProperty('success')
    expect(seen).toEqual(['withdraw'])
  })

  it('does not withdraw or enroll when an already-off member is provider-unsubscribed', async () => {
    const seen: string[] = []
    const result = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      lookup: async () => 'unsubscribed',
      readLocallyOptedIn: async () => false,
      withdraw: async () => {
        seen.push('withdraw')
        return { status: 'opted_out' }
      },
      commit: async () => {
        seen.push('commit')
        return { status: 'opted_in' }
      },
    })
    expect(result).toEqual({ status: 'blocked_resubscription' })
    expect(seen).toEqual([])
  })

  it('preserves the preference when the provider lookup fails', async () => {
    const seen: string[] = []
    const result = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      lookup: async () => {
        throw new Error('provider down')
      },
      readLocallyOptedIn: async () => false,
      withdraw: async () => {
        seen.push('withdraw')
        return { status: 'opted_out' }
      },
      commit: async () => {
        seen.push('commit')
        return { status: 'opted_in' }
      },
    })
    expect(result).toEqual({ status: 'unavailable' })
    expect(result).not.toHaveProperty('success')
    expect(seen).toEqual([])
  })

  it('commits only after a missing or subscribed lookup and keeps a raced block unsuccessful', async () => {
    const missing = ports()
    const missingResult = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      now: () => '2026-10-29T18:00:00.000Z',
      ...missing,
      lookup: async () => 'missing',
    })
    expect(missingResult).toEqual({ success: true })
    expect(missing.calls).toEqual(['commit:2026-10-29T18:00:00.000Z'])

    const raced = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      lookup: async () => 'subscribed',
      readLocallyOptedIn: async () => false,
      withdraw: async () => ({ status: 'opted_out' }),
      commit: async () => ({ status: 'blocked_resubscription' }),
    })
    expect(raced).toEqual({ status: 'blocked_resubscription' })
    expect(raced).not.toHaveProperty('success')
  })

  it('does not claim a local opt-in when the provider is subscribed and the local record is off', async () => {
    const seen: string[] = []
    const result = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      lookup: async () => {
        seen.push('lookup')
        return 'subscribed'
      },
      readLocallyOptedIn: async () => false,
      withdraw: async () => {
        seen.push('withdraw')
        return { status: 'opted_out' }
      },
      commit: async () => {
        seen.push('commit')
        return { status: 'opted_in' }
      },
    })
    expect(result).toEqual({ success: true })
    expect(seen).toEqual(['lookup', 'commit'])
  })

  it('does not confirm an unchanged checked preference when the provider lookup fails', async () => {
    const seen: string[] = []
    const result = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      lookup: async () => {
        seen.push('lookup')
        throw new Error('provider down')
      },
      readLocallyOptedIn: async () => true,
      withdraw: async () => {
        seen.push('withdraw')
        return { status: 'opted_out' }
      },
      commit: async () => {
        seen.push('commit')
        return { status: 'opted_in' }
      },
    })
    expect(result).toEqual({ status: 'unavailable' })
    expect(result).not.toHaveProperty('success')
    expect(seen).toEqual(['lookup'])
  })

  it('leaves an unchanged local opt-in without another enrollment and an unchanged opt-out without a withdrawal', async () => {
    const unchangedOn: string[] = []
    const keptOn = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      lookup: async () => {
        unchangedOn.push('lookup')
        return 'subscribed'
      },
      readLocallyOptedIn: async () => true,
      withdraw: async () => {
        unchangedOn.push('withdraw')
        return { status: 'opted_out' }
      },
      commit: async () => {
        unchangedOn.push('commit')
        return { status: 'opted_in' }
      },
    })
    expect(keptOn).toEqual({ success: true })
    expect(unchangedOn).toEqual(['lookup'])

    const missing: string[] = []
    const keptMissing = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      lookup: async () => {
        missing.push('lookup')
        return 'missing'
      },
      readLocallyOptedIn: async () => true,
      withdraw: async () => {
        missing.push('withdraw')
        return { status: 'opted_out' }
      },
      commit: async () => {
        missing.push('commit')
        return { status: 'opted_in' }
      },
    })
    expect(keptMissing).toEqual({ success: true })
    expect(missing).toEqual(['lookup'])

    const unchangedOff: string[] = []
    const keptOff = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: false,
      lookup: async () => {
        unchangedOff.push('lookup')
        return 'subscribed'
      },
      readLocallyOptedIn: async () => false,
      withdraw: async () => {
        unchangedOff.push('withdraw')
        return { status: 'opted_out' }
      },
      commit: async () => {
        unchangedOff.push('commit')
        return { status: 'opted_in' }
      },
    })
    expect(keptOff).toEqual({ success: true })
    expect(unchangedOff).toEqual([])
  })

  it('does not show success when the withdrawal or commit fails', async () => {
    const optedOut = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: false,
      lookup: async () => 'subscribed',
      readLocallyOptedIn: async () => true,
      withdraw: async () => ({ error: 'no' }),
      commit: async () => ({ status: 'opted_in' }),
    })
    const optedIn = await completeAccountMarketingPreference({
      signedIn: true,
      email: 'person@example.com',
      optIn: true,
      lookup: async () => 'subscribed',
      readLocallyOptedIn: async () => false,
      withdraw: async () => ({ status: 'opted_out' }),
      commit: async () => ({ error: 'no' }),
    })
    expect(optedOut).toEqual({ error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR })
    expect(optedIn).toEqual({ error: EMAIL_MARKETING_PREFERENCE_SAVE_ERROR })
    expect(optedOut).not.toHaveProperty('success')
    expect(optedIn).not.toHaveProperty('success')
  })
})

describe('provider lookup classification', () => {
  it('treats only an explicit boolean as subscribed or unsubscribed', () => {
    expect(classifyMarketingProviderLookup({ status: 404 })).toBe('missing')
    expect(
      classifyMarketingProviderLookup({ status: 200, unsubscribed: true })
    ).toBe('unsubscribed')
    expect(
      classifyMarketingProviderLookup({ status: 200, unsubscribed: false })
    ).toBe('subscribed')
    expect(classifyMarketingProviderLookup({ status: 200 })).toBe('unavailable')
    expect(classifyMarketingProviderLookup({ status: 500, unsubscribed: false })).toBe(
      'unavailable'
    )
  })

  it('does not call the provider without a key and does not write a contact', async () => {
    const fetchImpl = vi.fn()
    await expect(
      lookupMarketingProviderContact({
        email: 'person@example.com',
        apiKey: ' ',
        fetchImpl,
      })
    ).resolves.toBe('unavailable')
    expect(fetchImpl).not.toHaveBeenCalled()

    fetchImpl.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ unsubscribed: false }),
    })
    await expect(
      lookupMarketingProviderContact({
        email: 'person@example.com',
        apiKey: 'test-key',
        fetchImpl,
      })
    ).resolves.toBe('subscribed')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/contacts/')
  })

  it('keeps the worker from sending unsubscribed false for an unsubscribed contact', () => {
    expect(
      decideEmailMarketingSync({
        action: 'enroll',
        local: {
          email: 'person@example.com',
          emailConfirmed: true,
          optIn: true,
          optedOutAt: null,
        },
        providerUnsubscribed: true,
      })
    ).toBe('record_provider_unsubscribe')
  })
})

describe('account marketing preference function', () => {
  const sql = readFileSync(
    'supabase/migrations/20261029120000_account_email_marketing_preference.sql',
    'utf8'
  )
  const member = sql.slice(
    sql.indexOf('function public.set_own_email_marketing_preference'),
    sql.indexOf('function public.commit_email_marketing_opt_in')
  )
  const commit = sql.slice(sql.indexOf('function public.commit_email_marketing_opt_in'))

  it('accepts only the signed-in member and does not opt in from that function', () => {
    expect(sql).toContain(
      'function public.set_own_email_marketing_preference(opt_in boolean)'
    )
    expect(member).toContain('actor := auth.uid()')
    expect(member).toContain("coalesce(auth.role(), '') is distinct from 'authenticated'")
    expect(member).toContain('grant execute on function public.set_own_email_marketing_preference(boolean)')
    expect(member).toContain('to authenticated')
    expect(member).toContain("raise exception 'pending_provider_confirmation'")
    expect(member).not.toContain("'enroll'")
    expect(member).not.toContain('email_marketing_opt_in = true')
    expect(sql).not.toMatch(/set_own_email_marketing_preference\([^)]*uuid/)
    expect(sql).not.toMatch(/net\.http|dblink|api\.resend\.com/i)
  })

  it('opts out through the existing withdrawal and commits opt-in only for service role', () => {
    expect(member).toContain('perform public.apply_email_marketing_withdrawal(actor)')
    expect(commit).toContain("coalesce(auth.role(), '') is distinct from 'service_role'")
    expect(commit).toContain('grant execute on function public.commit_email_marketing_opt_in(uuid, timestamptz)')
    expect(commit).toContain('to service_role')
    expect(commit).toContain("'account_preference'")
    expect(commit).toContain("'enroll', 'pending'")
    expect(commit).toContain("return 'blocked_resubscription'")
    expect(commit).toContain('current_opt_out > checked_at')
    expect(commit).toContain(
      'revoke all on function public.commit_email_marketing_opt_in(uuid, timestamptz)'
    )
    expect(commit).toContain('from public, anon, authenticated, service_role')
    expect(sql).toContain('call it only after a provider lookup, made outside this transaction')
    expect(sql).toContain('Checking Resend inside this transaction is not')
    expect(commit).not.toMatch(/resend|http_request|net\.http/i)
  })

  it('does not write essential acknowledgement or unrelated profile fields', () => {
    const update = commit.slice(commit.indexOf('update public.profiles'), commit.indexOf('update public.email_marketing_sync'))
    expect(update).toContain('email_marketing_opt_in = true')
    expect(update).not.toContain('essential_email')
    expect(update).not.toContain('full_name')
    expect(update).not.toContain('application_status')
    expect(update).not.toContain('approval_gates')
    expect(update).not.toContain('role')
    expect(member).not.toContain('essential_email')
  })
})
