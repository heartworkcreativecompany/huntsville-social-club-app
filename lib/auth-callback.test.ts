import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AUTH_CALLBACK_FAILED_LOGIN_PATH,
  EMAIL_CONFIRMED_LOGIN_PATH,
  RECOVERY_LOGIN_PATH,
  authCallbackRedirectExposesSecrets,
  classifyAuthExchangeFailure,
  isConfirmationCallbackNext,
  loginStatusFromSearch,
  resolveAuthCallbackRedirect,
  safeAuthCallbackNext,
  signupConfirmationReplayPath,
} from '@/lib/auth-callback'
import { EMAIL_CONFIRMED_SUCCESS } from '@/lib/auth-errors'
import { ACCOUNT_CREATED_CONFIRMATION_BODY } from '@/lib/auth-email'
import { ResendConfirmationHelp } from '@/components/auth/resend-confirmation-email'
import { SUPPORT_EMAIL } from '@/lib/site'

const confirmationNext = '/login?confirmed=1'

describe('safeAuthCallbackNext', () => {
  it('rejects open redirects', () => {
    expect(safeAuthCallbackNext('https://evil.example')).toBe('/home')
    expect(safeAuthCallbackNext('//evil.example')).toBe('/home')
    expect(safeAuthCallbackNext('/login?confirmed=1')).toBe('/login?confirmed=1')
    expect(safeAuthCallbackNext('/upgrade?plan=connect')).toBe(
      '/upgrade?plan=connect'
    )
  })
})

describe('isConfirmationCallbackNext', () => {
  it('detects the signup confirmation destination', () => {
    expect(isConfirmationCallbackNext(confirmationNext)).toBe(true)
    expect(isConfirmationCallbackNext('/home')).toBe(false)
    expect(isConfirmationCallbackNext('/login/reset-password')).toBe(false)
    expect(isConfirmationCallbackNext('/upgrade?plan=connect')).toBe(false)
  })
})

describe('signupConfirmationReplayPath', () => {
  it('accepts the login confirmation destination and canonical paid Upgrade paths', () => {
    expect(signupConfirmationReplayPath(confirmationNext)).toBe(
      EMAIL_CONFIRMED_LOGIN_PATH
    )
    expect(signupConfirmationReplayPath('/upgrade?plan=connect')).toBe(
      '/upgrade?plan=connect'
    )
    expect(signupConfirmationReplayPath('/upgrade?plan=inner_circle')).toBe(
      '/upgrade?plan=inner_circle'
    )
    expect(signupConfirmationReplayPath('/upgrade?plan=elite_circle')).toBe(
      '/upgrade?plan=elite_circle'
    )
  })

  it('rejects invalid, external, and non-confirmation destinations', () => {
    expect(signupConfirmationReplayPath('/upgrade')).toBeNull()
    expect(signupConfirmationReplayPath('/upgrade?plan=not_a_tier')).toBeNull()
    expect(signupConfirmationReplayPath('/home')).toBeNull()
    expect(signupConfirmationReplayPath('https://evil.example')).toBeNull()
    expect(signupConfirmationReplayPath('//evil.example')).toBeNull()
    expect(signupConfirmationReplayPath('/login/reset-password')).toBeNull()
  })
})

describe('classifyAuthExchangeFailure', () => {
  it('treats PKCE replay and missing verifier as consumed, not expiry', () => {
    expect(
      classifyAuthExchangeFailure('invalid flow state, flow_state_not_found')
    ).toBe('consumed_or_replay')
    expect(
      classifyAuthExchangeFailure(
        'invalid request: both auth code and code verifier should be non-empty'
      )
    ).toBe('consumed_or_replay')
    expect(classifyAuthExchangeFailure('invalid grant')).toBe('consumed_or_replay')
  })

  it('treats genuine OTP/link expiry as expired_or_invalid', () => {
    expect(classifyAuthExchangeFailure('otp_expired')).toBe('expired_or_invalid')
    expect(
      classifyAuthExchangeFailure('Email link is invalid or has expired')
    ).toBe('expired_or_invalid')
  })
})

describe('resolveAuthCallbackRedirect', () => {
  it('sends a valid signup confirmation to the success login state', () => {
    const path = resolveAuthCallbackRedirect({
      next: confirmationNext,
      type: 'signup',
      hasCode: true,
      hasTokenHash: false,
      exchangeError: null,
      existingEmailConfirmed: true,
    })
    expect(path).toBe(EMAIL_CONFIRMED_LOGIN_PATH)
    expect(path).not.toContain('auth_callback_failed')
    expect(authCallbackRedirectExposesSecrets(path)).toBe(false)
  })

  it('sends first-time paid-plan confirmations to the validated Upgrade destination', () => {
    for (const tier of ['connect', 'inner_circle', 'elite_circle'] as const) {
      const next = `/upgrade?plan=${tier}`
      expect(
        resolveAuthCallbackRedirect({
          next,
          type: 'signup',
          hasCode: true,
          hasTokenHash: false,
          exchangeError: null,
          existingEmailConfirmed: true,
        })
      ).toBe(next)
      expect(
        resolveAuthCallbackRedirect({
          next,
          type: 'signup',
          hasCode: true,
          hasTokenHash: false,
          exchangeError: null,
          existingEmailConfirmed: false,
        })
      ).toBe(next)
    }
  })

  it('does not fail a consumed confirmation when the account is already confirmed', () => {
    const path = resolveAuthCallbackRedirect({
      next: confirmationNext,
      type: 'signup',
      hasCode: true,
      hasTokenHash: false,
      exchangeError: 'flow_state_not_found',
      existingEmailConfirmed: true,
    })
    expect(path).toBe(EMAIL_CONFIRMED_LOGIN_PATH)
    expect(path).not.toContain('auth_callback_failed')
  })

  it('does not fail a consumed PKCE confirmation code (scanner or second click)', () => {
    const path = resolveAuthCallbackRedirect({
      next: confirmationNext,
      type: 'signup',
      hasCode: true,
      hasTokenHash: false,
      exchangeError:
        'invalid request: both auth code and code verifier should be non-empty',
      existingEmailConfirmed: false,
    })
    expect(path).toBe(EMAIL_CONFIRMED_LOGIN_PATH)
    expect(path).not.toContain('Link could not be verified')
    expect(path).not.toContain('auth_callback_failed')
  })

  it('treats a consumed paid-plan confirmation replay as success, not failed login', () => {
    const consumed =
      'invalid request: both auth code and code verifier should be non-empty'
    for (const tier of ['connect', 'inner_circle', 'elite_circle'] as const) {
      const path = resolveAuthCallbackRedirect({
        next: `/upgrade?plan=${tier}`,
        type: 'signup',
        hasCode: true,
        hasTokenHash: false,
        exchangeError: consumed,
        existingEmailConfirmed: false,
      })
      expect(path).toBe(`/upgrade?plan=${tier}`)
      expect(path).not.toContain('auth_callback_failed')
    }
  })

  it('does not treat consumed confirmation replay as success for invalid next values', () => {
    for (const next of [
      '/upgrade?plan=not_a_tier',
      '/home',
      'https://evil.example',
      '//evil.example',
    ]) {
      expect(
        resolveAuthCallbackRedirect({
          next,
          type: 'signup',
          hasCode: true,
          hasTokenHash: false,
          exchangeError: 'invalid grant',
          existingEmailConfirmed: false,
        })
      ).toBe(AUTH_CALLBACK_FAILED_LOGIN_PATH)
    }
  })

  it('shows the generic failure path for a genuinely expired confirmation link', () => {
    const path = resolveAuthCallbackRedirect({
      next: confirmationNext,
      type: 'signup',
      hasCode: true,
      hasTokenHash: false,
      exchangeError: 'Email link is invalid or has expired',
      existingEmailConfirmed: false,
    })
    expect(path).toBe(AUTH_CALLBACK_FAILED_LOGIN_PATH)
  })

  it('still fails expired confirmation codes that point at a paid Upgrade destination', () => {
    expect(
      resolveAuthCallbackRedirect({
        next: '/upgrade?plan=connect',
        type: 'signup',
        hasCode: true,
        hasTokenHash: false,
        exchangeError: 'otp_expired',
        existingEmailConfirmed: false,
      })
    ).toBe(AUTH_CALLBACK_FAILED_LOGIN_PATH)
  })

  it('treats Supabase provider error params without a code as a genuine failure', () => {
    const path = resolveAuthCallbackRedirect({
      next: confirmationNext,
      type: 'signup',
      hasCode: false,
      hasTokenHash: false,
      exchangeError: null,
      existingEmailConfirmed: false,
      providerAuthError: true,
    })
    expect(path).toBe(AUTH_CALLBACK_FAILED_LOGIN_PATH)
  })

  it('keeps password recovery on the reset-password destination', () => {
    expect(
      resolveAuthCallbackRedirect({
        next: '/login/reset-password',
        type: 'recovery',
        hasCode: true,
        hasTokenHash: false,
        exchangeError: null,
        existingEmailConfirmed: true,
      })
    ).toBe(RECOVERY_LOGIN_PATH)
  })

  it('does not treat a failed recovery exchange as email confirmation', () => {
    expect(
      resolveAuthCallbackRedirect({
        next: '/login/reset-password',
        type: 'recovery',
        hasCode: true,
        hasTokenHash: false,
        exchangeError: 'otp_expired',
        existingEmailConfirmed: false,
      })
    ).toBe(AUTH_CALLBACK_FAILED_LOGIN_PATH)
  })

  it('keeps magic-link success on the requested next path', () => {
    expect(
      resolveAuthCallbackRedirect({
        next: '/home',
        type: 'magiclink',
        hasCode: true,
        hasTokenHash: false,
        exchangeError: null,
        existingEmailConfirmed: true,
      })
    ).toBe('/home')
  })

  it('does not treat a consumed magic-link as a confirmation replay', () => {
    expect(
      resolveAuthCallbackRedirect({
        next: '/upgrade?plan=connect',
        type: 'magiclink',
        hasCode: true,
        hasTokenHash: false,
        exchangeError: 'invalid grant',
        existingEmailConfirmed: false,
      })
    ).toBe(AUTH_CALLBACK_FAILED_LOGIN_PATH)
  })

  it('does not treat a consumed recovery code as paid-plan confirmation', () => {
    expect(
      resolveAuthCallbackRedirect({
        next: '/upgrade?plan=connect',
        type: 'recovery',
        hasCode: true,
        hasTokenHash: false,
        exchangeError: 'invalid grant',
        existingEmailConfirmed: false,
      })
    ).toBe(AUTH_CALLBACK_FAILED_LOGIN_PATH)
  })

  it('never puts tokens or codes on the redirect path', () => {
    const path = resolveAuthCallbackRedirect({
      next: confirmationNext,
      type: 'signup',
      hasCode: true,
      hasTokenHash: true,
      exchangeError: null,
      existingEmailConfirmed: true,
    })
    expect(authCallbackRedirectExposesSecrets(path)).toBe(false)
    expect(path).not.toMatch(/token/i)
  })
})

describe('loginStatusFromSearch', () => {
  it('prefers confirmation success over a stale callback error', () => {
    expect(
      loginStatusFromSearch({
        confirmed: '1',
        reset: null,
        error: 'auth_callback_failed',
      })
    ).toBe('confirmed')
  })

  it('still surfaces a genuine callback failure', () => {
    expect(
      loginStatusFromSearch({
        confirmed: null,
        reset: null,
        error: 'auth_callback_failed',
      })
    ).toBe('callback_failed')
  })

  it('keeps password-updated success', () => {
    expect(
      loginStatusFromSearch({
        confirmed: null,
        reset: 'success',
        error: null,
      })
    ).toBe('reset')
  })
})

describe('confirmation copy', () => {
  it('uses the approved account-created body without mentioning Supabase', () => {
    expect(ACCOUNT_CREATED_CONFIRMATION_BODY).toBe(
      'Check your email for the confirmation link, then sign in once it\'s verified. If the email does not arrive, first check your spam folder then click on “Didn\'t get a confirmation email?” on the Sign In page.'
    )
    expect(ACCOUNT_CREATED_CONFIRMATION_BODY.toLowerCase()).not.toContain('supabase')
    expect(EMAIL_CONFIRMED_SUCCESS).toBe('Email confirmed. You can now sign in.')
  })

  it('renders the support mailbox as a mailto link in resend help', () => {
    const html = renderToStaticMarkup(createElement(ResendConfirmationHelp))
    expect(html).toContain(`mailto:${SUPPORT_EMAIL}`)
    expect(html).toContain('>hello@huntsvillesocialclub.com<')
    expect(html).toContain(
      'If you still do not see the email, save this email address as a safe sender'
    )
    expect(html.toLowerCase()).not.toContain('supabase')
    expect(html).not.toContain('Email verified should show Complete')
    expect(html).toContain('break-all')
    expect(html).toContain('focus-visible:ring-2')
  })
})

describe('callback route hygiene', () => {
  it('does not log callback secrets and skips a second code exchange when already confirmed', () => {
    const source = readFileSync(
      join(__dirname, '../app/auth/callback/route.ts'),
      'utf8'
    )
    expect(source).not.toContain('console.log')
    expect(source).toContain('alreadyConfirmed')
    expect(source).toContain('exchangeCodeForSession')
    expect(source).toContain('verifyOtp')
    expect(source).toContain('if (code && !alreadyConfirmed)')
    expect(source).not.toContain('createMembershipCheckoutSession')
  })
})

describe('signup confirmation redirect targets', () => {
  it('keeps the default confirmation next and only uses a safe Upgrade return path', () => {
    const signup = readFileSync(join(__dirname, '../app/signup/page.tsx'), 'utf8')
    expect(signup).toContain("authCallbackUrl(returnPath ?? '/login?confirmed=1')")
    expect(signup).toContain('safeUpgradeReturnPath(searchParams.get(\'next\'))')
    expect(signup).not.toContain('createMembershipCheckoutSession')
  })
})
