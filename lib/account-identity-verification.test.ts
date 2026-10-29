import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}))

import IdentityVerificationCard from '@/components/profile/identity-verification-card'
import {
  ACCOUNT_IDENTITY_CANCELED_DETAIL,
  ACCOUNT_IDENTITY_NOT_STARTED_DETAIL,
  ACCOUNT_IDENTITY_RETRY_DETAIL,
  ACCOUNT_IDENTITY_VERIFICATION_HREF,
  ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL,
  ACCOUNT_IDENTITY_VERIFIED_DETAIL,
  accountIdentityVerificationCard,
} from '@/lib/account-identity-verification'
import { isMessagingSuspended } from '@/lib/messaging-suspension'
import { acceptedIdentityStatus } from '@/lib/identity-verification'
import {
  IDENTITY_MUTUAL_MESSAGE,
  IDENTITY_REQUIRED_BEFORE_MESSAGING,
} from '@/lib/identity-verification'

const activeInPerson = { status: 'verified' as const, revokedAt: null }

describe('account identity verification card', () => {
  it('shows the verification action for an approved member without accepted identity', () => {
    const accepted = acceptedIdentityStatus({
      stripeStatus: 'not_started',
      inPersonLookup: { ok: true, record: null },
      approvalGateIdentity: 'approved',
      billingTier: 'elite_circle',
    })
    const card = accountIdentityVerificationCard({
      accepted,
      stripeStatus: 'not_started',
    })
    const html = renderToStaticMarkup(
      createElement(IdentityVerificationCard, { card })
    )

    expect(accepted).toBe('unverified')
    expect(card.actionLabel).toBe(ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL)
    expect(card.createsSession).toBe(true)
    expect(card.detail).toBe(ACCOUNT_IDENTITY_NOT_STARTED_DETAIL)
    expect(html).toContain(ACCOUNT_IDENTITY_NOT_STARTED_DETAIL)
    expect(html).toContain(ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL)
    expect(html).toContain('data-creates-session="true"')
  })

  it('treats Stripe verification and active in-person verification as accepted', () => {
    const stripe = acceptedIdentityStatus({
      stripeStatus: 'verified',
      inPersonLookup: { ok: true, record: null },
    })
    const inPerson = acceptedIdentityStatus({
      stripeStatus: 'not_started',
      inPersonLookup: { ok: true, record: activeInPerson },
    })

    expect(accountIdentityVerificationCard({ accepted: stripe }).statusLabel).toBe(
      'Identity verified'
    )
    expect(
      accountIdentityVerificationCard({
        accepted: inPerson,
        stripeStatus: 'not_started',
      })
    ).toMatchObject({
      statusLabel: 'Identity verified',
      action: null,
      createsSession: false,
    })
  })

  it('shows pending and retry states without a second session while pending', () => {
    const pending = accountIdentityVerificationCard({
      accepted: 'unverified',
      stripeStatus: 'processing',
    })
    const pendingHtml = renderToStaticMarkup(
      createElement(IdentityVerificationCard, { card: pending })
    )
    const retry = accountIdentityVerificationCard({
      accepted: 'unverified',
      stripeStatus: 'requires_input',
    })
    const canceled = accountIdentityVerificationCard({
      accepted: 'unverified',
      stripeStatus: 'canceled',
    })

    expect(pending).toMatchObject({
      statusLabel: 'Processing',
      action: null,
      createsSession: false,
    })
    expect(pendingHtml).toContain('Processing')
    expect(pendingHtml).toContain('will not start another session')
    expect(pendingHtml).toContain('Refresh status')
    expect(pendingHtml).toContain('data-creates-session="false"')
    expect(pendingHtml).not.toContain(ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL)
    const queuedHtml = renderToStaticMarkup(
      createElement(IdentityVerificationCard, {
        card: accountIdentityVerificationCard({
          accepted: 'unverified',
          stripeStatus: 'pending',
        }),
      })
    )
    expect(queuedHtml).toContain('Pending')
    expect(queuedHtml).toContain('data-creates-session="false"')
    const retryHtml = renderToStaticMarkup(
      createElement(IdentityVerificationCard, {
        card: retry,
        lastError: 'The document was unreadable.',
      })
    )
    expect(retry).toMatchObject({
      statusLabel: 'Needs retry',
      action: 'retry',
      actionLabel: 'Retry verification',
      createsSession: true,
    })
    expect(retry.detail).toBe(ACCOUNT_IDENTITY_RETRY_DETAIL)
    expect(retryHtml).toContain('Needs retry')
    expect(retryHtml).toContain(ACCOUNT_IDENTITY_RETRY_DETAIL)
    expect(retryHtml).toContain('Retry verification')
    expect(retryHtml).toContain('not required for membership approval')
    expect(retryHtml).toContain('The document was unreadable.')
    expect(retryHtml).not.toMatch(/approval was lost|not approved|reapply/i)
    expect(retryHtml).toContain('data-creates-session="true"')
    const canceledHtml = renderToStaticMarkup(
      createElement(IdentityVerificationCard, { card: canceled })
    )
    expect(canceled.action).toBe('start')
    expect(canceled.createsSession).toBe(true)
    expect(canceled.detail).toBe(ACCOUNT_IDENTITY_CANCELED_DETAIL)
    expect(canceledHtml).toContain('Canceled')
    expect(canceledHtml).toContain(ACCOUNT_IDENTITY_CANCELED_DETAIL)
    expect(canceledHtml).toContain('not required for membership approval')
    expect(canceledHtml).not.toMatch(/approval was lost|not approved|reapply/i)
    expect(canceledHtml).toContain(ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL)
  })

  it('renders accepted Stripe and in-person identity without a new session', () => {
    const stripeHtml = renderToStaticMarkup(
      createElement(IdentityVerificationCard, {
        card: accountIdentityVerificationCard({
          accepted: 'verified',
          stripeStatus: 'verified',
        }),
      })
    )
    const inPersonHtml = renderToStaticMarkup(
      createElement(IdentityVerificationCard, {
        card: accountIdentityVerificationCard({
          accepted: 'verified',
          stripeStatus: 'not_started',
        }),
      })
    )
    for (const html of [stripeHtml, inPersonHtml]) {
      expect(html).toContain('Identity verified')
      expect(html).toContain(ACCOUNT_IDENTITY_VERIFIED_DETAIL)
      expect(html).not.toContain(ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL)
      expect(html).not.toContain('data-creates-session="true"')
    }
  })

  it('does not offer a new session when identity lookup is unavailable', () => {
    const card = accountIdentityVerificationCard({
      accepted: 'unavailable',
      stripeStatus: 'not_started',
    })
    const html = renderToStaticMarkup(createElement(IdentityVerificationCard, { card }))
    expect(card.createsSession).toBe(false)
    expect(card.action).toBeNull()
    expect(card.statusLabel).not.toBe('Identity verified')
    expect(html).toContain('Unavailable')
    expect(html).toContain('Refresh status')
    expect(html).toContain('data-creates-session="false"')
    expect(html).not.toContain(ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL)
  })
})

describe('messaging entry point', () => {
  it('keeps the account verification route separate from membership approval', () => {
    expect(ACCOUNT_IDENTITY_VERIFICATION_HREF).toBe('/profile#identity-verification')
    const entry = readFileSync(
      'components/profile/identity-verification-entry-link.tsx',
      'utf8'
    )
    expect(entry).toContain('ACCOUNT_IDENTITY_VERIFICATION_HREF')
    expect(entry).toContain('ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL')
    for (const path of [
      'app/(club)/messages/page.tsx',
      'components/members/member-profile-message-form.tsx',
    ]) {
      expect(readFileSync(path, 'utf8')).toContain('IdentityVerificationEntryLink')
    }
    for (const path of [
      'components/messages/message-thread.tsx',
      'components/matches/curated-match-intro-button.tsx',
    ]) {
      const source = readFileSync(path, 'utf8')
      expect(source).toContain('ACCOUNT_IDENTITY_VERIFICATION_HREF')
      expect(source).toContain('Verify my identity')
    }
  })

  it('keeps the verified detail from granting send access to a suspended account', () => {
    const card = accountIdentityVerificationCard({
      accepted: 'verified',
      stripeStatus: 'verified',
    })
    const html = renderToStaticMarkup(
      createElement(IdentityVerificationCard, { card })
    )
    expect(card.statusLabel).toBe('Identity verified')
    expect(card.detail).toBe(ACCOUNT_IDENTITY_VERIFIED_DETAIL)
    expect(card.detail).not.toMatch(/you can request/i)
    expect(card.action).toBeNull()
    expect(card.createsSession).toBe(false)
    expect(html).toContain(ACCOUNT_IDENTITY_VERIFIED_DETAIL)
    expect(
      isMessagingSuspended({ messaging_suspended_at: '2026-10-29T18:00:00.000Z' })
    ).toBe(true)
    const messaging = readFileSync('lib/require-messaging.ts', 'utf8')
    expect(messaging).toContain('isMessagingSuspended(viewer.profile)')
    expect(messaging).toContain('MESSAGING_SUSPENDED_SEND_ERROR')
    expect(readFileSync('lib/account-identity-verification.ts', 'utf8')).not.toContain(
      'messaging_suspended'
    )
  })

  it('does not let accepted identity bypass the recipient rule', () => {
    const sender = acceptedIdentityStatus({
      stripeStatus: 'verified',
      inPersonLookup: { ok: true, record: null },
    })
    const recipient = acceptedIdentityStatus({
      stripeStatus: 'not_started',
      inPersonLookup: { ok: true, record: null },
      approvalGateIdentity: 'approved',
    })
    expect(sender).toBe('verified')
    expect(recipient).toBe('unverified')
    expect(IDENTITY_MUTUAL_MESSAGE).not.toBe(IDENTITY_REQUIRED_BEFORE_MESSAGING)
  })

  it('keeps entry-point wording and authorization separate from the account card', () => {
    const entryPoints = [
      'app/(club)/messages/page.tsx',
      'app/(club)/messages/[conversationId]/page.tsx',
      'components/messages/message-thread.tsx',
      'components/matches/curated-match-intro-button.tsx',
      'lib/require-messaging.ts',
    ]
    for (const path of entryPoints) {
      const source = readFileSync(path, 'utf8')
      expect(source).toContain('IDENTITY_REQUIRED_BEFORE_MESSAGING')
      expect(source).not.toContain(ACCOUNT_IDENTITY_VERIFIED_DETAIL)
      expect(source).not.toContain(ACCOUNT_IDENTITY_NOT_STARTED_DETAIL)
    }
    const profileForm = readFileSync(
      'components/members/member-profile-message-form.tsx',
      'utf8'
    )
    expect(profileForm).toContain('PROFILE_IDENTITY_REQUIRED_COPY')
    expect(profileForm).not.toContain(ACCOUNT_IDENTITY_NOT_STARTED_DETAIL)
    expect(readFileSync('lib/require-messaging.ts', 'utf8')).toContain(
      'assertCanStartMessageRequest'
    )
  })
})
