import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PrivacyPage from '@/app/privacy/page'
import ApplicantVerificationProgress from '@/components/application/applicant-verification-progress'
import {
  IDENTITY_BEFORE_YOU_START_ITEMS,
  IDENTITY_VERIFICATION_FAQS,
  IDENTITY_VERIFICATION_HEADING,
  IDENTITY_VERIFICATION_INTRO,
  IDENTITY_VERIFICATION_PURPOSE,
  IDENTITY_VERIFICATION_SAFETY,
  PRIVACY_IDENTITY_PARAGRAPHS,
  STRIPE_IDENTITY_ENABLED_CHECKS,
  STRIPE_IDENTITY_URL,
  STRIPE_PRIVACY_URL,
} from '@/lib/identity-verification-copy'
import {
  HISTORICAL_INDUSTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  formatIndustryLabel,
  isHistoricalIndustryValue,
  parseIndustryValue,
} from '@/lib/industries'
import { emptyApprovalGates } from '@/lib/membership-systems'
import { SUPPORT_EMAIL } from '@/lib/site'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}))

const repoRoot = join(__dirname, '..')

describe('identity verification guidance', () => {
  const sessionSource = readFileSync(
    join(repoRoot, 'lib/stripe/identity.ts'),
    'utf8'
  )
  const html = renderToStaticMarkup(
    createElement(ApplicantVerificationProgress, {
      gates: emptyApprovalGates(),
      emailConfirmed: true,
      identityVerificationStatus: 'not_started',
    })
  )
  const startAt = html.indexOf('Start verification')
  const headingAt = html.indexOf(IDENTITY_VERIFICATION_HEADING)
  const prepareAt = html.indexOf('Before you start')

  it('renders the privacy block and preparation panel before the verification action', () => {
    expect(headingAt).toBeGreaterThan(-1)
    expect(prepareAt).toBeGreaterThan(headingAt)
    expect(startAt).toBeGreaterThan(prepareAt)
    expect(html).toContain(IDENTITY_VERIFICATION_INTRO)
    expect(html).toContain(IDENTITY_VERIFICATION_PURPOSE)
    expect(html).toContain(IDENTITY_VERIFICATION_SAFETY)
    expect(html).toContain(`href="mailto:${SUPPORT_EMAIL}"`)
    expect(html).toContain(`href="${STRIPE_IDENTITY_URL}"`)
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/data-deletion"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer"')
    for (const item of IDENTITY_BEFORE_YOU_START_ITEMS) {
      expect(html).toContain(item)
    }
    expect(html).toContain('<ul')
    expect(html).toContain('<h4')
  })

  it('renders seven keyboard-accessible FAQ disclosures after the action', () => {
    expect(html.indexOf('<details')).toBeGreaterThan(startAt)
    expect(html.match(/<details/g)).toHaveLength(7)
    expect(html.match(/<summary/g)).toHaveLength(7)
    for (const item of IDENTITY_VERIFICATION_FAQS) {
      expect(html).toContain(item.question)
    }
    expect(html).toContain('Availability of an alternative method may depend')
    expect(html).toContain('Data Deletion Request')
    expect(html).toContain('privacy@stripe.com')
    expect(html).not.toMatch(/manual appeal|automatically delete|we will approve/i)
    expect(html).not.toContain('<form')
  })

  it('describes only the document and matching-selfie checks', () => {
    expect(sessionSource).toContain("type: 'document'")
    expect(sessionSource).toContain('require_matching_selfie: true')
    expect(STRIPE_IDENTITY_ENABLED_CHECKS).toEqual({
      document: true,
      selfie: true,
      id_number: false,
      address: false,
      phone: false,
      email: false,
    })
    expect(html).not.toMatch(/id number check|address check|phone check|email check/i)
    expect(html).toContain('government-issued photo ID')
    expect(html).toContain('selfie')
    expect(html).not.toMatch(/sk_live|whsec_|vs_test|verification_session/i)
  })

  it('adds the Identity Verification section to the privacy policy', () => {
    const policy = renderToStaticMarkup(createElement(PrivacyPage))
    expect(policy).toContain('Identity Verification')
    expect(policy).toContain('What we collect')
    expect(policy).toContain('Photo storage')
    for (const paragraph of PRIVACY_IDENTITY_PARAGRAPHS) {
      expect(policy).toContain(paragraph)
    }
    expect(policy).toContain(`href="${STRIPE_IDENTITY_URL}"`)
    expect(policy).toContain(`href="${STRIPE_PRIVACY_URL}"`)
    expect(policy).toContain('href="/data-deletion"')
    expect(policy).toContain(SUPPORT_EMAIL)
    expect(policy).not.toMatch(/address check|phone check|email check|id number check/i)
    expect(policy).not.toMatch(/\b\d+ days\b/)
  })
})

describe('Huntsville industry options', () => {
  it('offers the new canonical choices and keeps historical slugs readable', () => {
    expect(INDUSTRY_OPTIONS.map((option) => option.label)).toContain(
      'Aerospace, Aviation & Space'
    )
    expect(INDUSTRY_OPTIONS.map((option) => option.label)).toContain(
      'Cybersecurity, IT & Software'
    )
    expect(INDUSTRY_OPTIONS.map((option) => option.value)).toContain('legal_services')
    expect(INDUSTRY_OPTIONS.map((option) => option.value)).not.toContain('technology')
    expect(isHistoricalIndustryValue('technology')).toBe(true)
    expect(parseIndustryValue('technology')).toBe('technology')
    expect(formatIndustryLabel('technology')).toBe('Technology')
    expect(parseIndustryValue('food_beverage')).toBe('food_beverage')
    expect(formatIndustryLabel('Aerospace')).toBe('Aerospace')
    expect(parseIndustryValue('aerospace_aviation_space')).toBe(
      'aerospace_aviation_space'
    )
    expect(HISTORICAL_INDUSTRY_OPTIONS.length).toBeGreaterThan(0)
    expect(INDUSTRY_OPTIONS.at(-1)?.label).toBe('Other')
  })
})
