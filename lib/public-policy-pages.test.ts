import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CodeOfConductPage from '@/app/code-of-conduct/page'
import LawEnforcementPage from '@/app/law-enforcement/page'
import RefundPolicyPage from '@/app/refund-policy/page'
import ReportingPage from '@/app/reporting/page'
import SafetyPage from '@/app/safety/page'
import TermsPage from '@/app/terms/page'
import SiteFooter from '@/components/shell/site-footer'
import {
  isMarketingPassthroughPath,
  MARKETING_BROWSER_ROUTES,
  proxyHostAction,
} from '@/lib/hostnames'
import { SUPPORT_EMAIL } from '@/lib/site'

const repoRoot = join(__dirname, '..')
const LAST_UPDATED = 'Last updated: November 16, 2026'
const REFUND_LAST_UPDATED = 'Last updated: November 11, 2026'
const DASH_CHARACTERS = /[\u2013\u2014]/
const AIDING_ABUSE = 'Aiding, abetting, or encouraging abuse of any person'
const TRAFFICKING =
  'Human trafficking, including sexual exploitation, and soliciting or facilitating commercial sex'
const PROHIBITED = [
  'Sexually explicit profile content or photos',
  'Child sexual exploitation or abuse',
  AIDING_ABUSE,
  'Sexual violence',
  'Non-consensual content',
  TRAFFICKING,
  'Scams, fraud, or requests for money',
  'Impersonation or fake profiles',
  'Harassment',
]

function pageMain(html: string) {
  return html.slice(html.indexOf('<main'), html.indexOf('</main>'))
}

describe('public dating policy pages', () => {
  const terms = renderToStaticMarkup(createElement(TermsPage))
  const conduct = renderToStaticMarkup(createElement(CodeOfConductPage))
  const safety = renderToStaticMarkup(createElement(SafetyPage))
  const refunds = renderToStaticMarkup(createElement(RefundPolicyPage))
  const lawEnforcement = renderToStaticMarkup(createElement(LawEnforcementPage))
  const reporting = renderToStaticMarkup(createElement(ReportingPage))
  const pages = [
    ['terms', terms, 'app/terms/page.tsx'],
    ['code of conduct', conduct, 'app/code-of-conduct/page.tsx'],
    ['safety', safety, 'app/safety/page.tsx'],
    ['refund policy', refunds, 'app/refund-policy/page.tsx'],
    ['law enforcement', lawEnforcement, 'app/law-enforcement/page.tsx'],
    ['reporting', reporting, 'app/reporting/page.tsx'],
  ] as const

  it('keeps the new policy routes public on the marketing host', () => {
    for (const path of [
      '/refund-policy',
      '/safety',
      '/law-enforcement',
      '/reporting',
    ] as const) {
      expect(MARKETING_BROWSER_ROUTES).toContain(path)
      expect(isMarketingPassthroughPath(path)).toBe(true)
      expect(proxyHostAction('marketing', path)).toEqual({ type: 'next' })
      expect(proxyHostAction('members', path)).toEqual({ type: 'next' })
      expect(proxyHostAction('preview', path)).toEqual({ type: 'next' })
    }
  })

  it('does not gate the policy pages behind login or data changes', () => {
    for (const [, , relativePath] of pages) {
      const source = readFileSync(join(repoRoot, relativePath), 'utf8')
      expect(source).not.toMatch(/getUser|redirect\(|cookies\(/)
      expect(source).not.toMatch(
        /supabase|insert\(|update\(|delete\(|fetch\(/i
      )
      expect(source).not.toMatch(DASH_CHARACTERS)
    }
  })

  it('dates every policy page today and avoids dash characters in the copy', () => {
    expect(SUPPORT_EMAIL).toBe('hello@huntsvillesocialclub.com')
    for (const [name, html] of pages) {
      const main = pageMain(html)
      expect(main.match(/<h1[\s>]/g)).toHaveLength(1)
      expect(main).toContain(
        name === 'refund policy' ? REFUND_LAST_UPDATED : LAST_UPDATED
      )
      expect(main).not.toMatch(DASH_CHARACTERS)
      expect(main).toContain(`mailto:${SUPPORT_EMAIL}`)
    }
  })

  it('states acceptable use on the terms of service', () => {
    const main = pageMain(terms)
    expect(main).toContain('Acceptable Use')
    expect(main).toContain('Members must be at least 18 years old.')
    for (const item of PROHIBITED) {
      expect(main).toContain(item)
    }
    expect(main).toContain(
      'Violations lead to content removal, messaging suspension, or permanent removal.'
    )
    expect(main).toContain('Removed members may not reapply.')
    expect(main).toContain(
      'We report suspected illegal activity to law enforcement, including the National Center for Missing and Exploited Children (NCMEC) for any child exploitation, and we respond to valid legal requests.'
    )
    expect(main).toContain('not a sexual or')
    expect(main).toContain('hook-up')
    expect(main).toContain('service')
    expect(main).toContain(AIDING_ABUSE)
    expect(main).toContain(TRAFFICKING)
    expect(main).toContain('href="/reporting"')
    expect(main).toContain('href="/law-enforcement"')
  })

  it('states the same rules and enforcement on the code of conduct', () => {
    const main = pageMain(conduct)
    expect(main).toContain('Members must be at least 18 years old.')
    expect(main).toContain('What is not allowed')
    for (const item of PROHIBITED) {
      expect(main).toContain(item)
    }
    expect(main).toContain('Enforcement')
    expect(main).toContain('warn you, suspend your messaging')
    expect(main).toContain('remove you permanently')
    expect(main).toContain('Repeat violations escalate')
    expect(main).toContain('Report option in any conversation')
    expect(main).toContain('Block option')
    expect(main).toContain('within 2 business days')
    expect(main).toContain('safety threats right away')
    expect(main).toContain('not a sexual')
    expect(main).toContain('hook-up')
  })

  it('explains meeting safety, scams, reporting, and emergencies', () => {
    const main = pageMain(safety)
    expect(main).toContain('Meet safely')
    expect(main).toContain('Meet in a public place')
    expect(main).toContain('Never send money or financial information')
    expect(main).toContain('Spot a scam')
    expect(main).toContain('gift card')
    expect(main).toContain('Report option in any conversation')
    expect(main).toContain('Block option')
    expect(main).toContain('call 911')
    expect(main).toContain('href="/reporting"')
    expect(main).toContain('href="/law-enforcement"')
  })

  it('explains law enforcement reports and legal requests', () => {
    const main = pageMain(lawEnforcement)
    expect(main).toContain('Law Enforcement and Legal Requests')
    expect(main).toContain(
      'We cooperate with law enforcement and report suspected illegal activity.'
    )
    expect(main).toContain('NCMEC CyberTipline')
    expect(main).toContain('National Human Trafficking Hotline')
    expect(main).toContain('Huntsville Police Department')
    expect(main).toContain('Internet Crime Complaint Center (IC3)')
    expect(main).toContain(
      'We preserve relevant account records when we find or receive a report of suspected illegal activity.'
    )
    expect(main).toContain('Law Enforcement Request')
    expect(main).toContain(
      'review emergency requests involving risk of death or serious injury right away'
    )
    expect(main).toContain('Members in danger should call 911.')
  })

  it('explains how to report, how reports are reviewed, and how to appeal', () => {
    const main = pageMain(reporting)
    expect(main).toContain('Reporting and Content Removal')
    expect(main).toContain('Report option in any conversation')
    expect(main).toContain('Block option')
    expect(main).toContain(
      'Anyone, including non-members, can report a profile or content by email, including content posted without their consent.'
    )
    expect(main).toContain('An administrator reviews every report.')
    expect(main).toContain('within 2 business days')
    expect(main).toContain('safety threats right away')
    expect(main).toContain('removed promptly')
    expect(main).toContain('permanently remove the member')
    expect(main).toContain('href="/law-enforcement"')
    expect(main).toContain('subject &quot;Appeal&quot;')
    expect(main).toContain('within 14 days')
    expect(main).toContain('within 5 business days')
    expect(main).toContain('not eligible for reinstatement')
  })

  it('explains membership, ticket, and sponsorship refunds', () => {
    const main = pageMain(refunds)
    expect(main).toContain('Paid memberships are monthly.')
    expect(main).toContain('cancel at any time in billing')
    expect(main).toContain(
      'Cancellation takes effect at the end of the current billing period.'
    )
    expect(main).toContain('partial-month refunds')
    expect(main).toContain('at least 48 hours before the event')
    expect(main).toContain('no refund within 48 hours')
    expect(main).toContain('no refund for no-shows')
    expect(main).toContain('cancels the event, you receive a full refund')
    expect(main).toContain(
      'Event sponsorships are refundable in full if cancelled at least 14 days before the event. Cancellations within 14 days of the event are not refundable. If Huntsville Social Club cancels the event, the sponsor receives a full refund or can move the sponsorship to a future event.'
    )
    expect(main).toContain('for billing help')
  })

  it('does not leave a sponsorship placeholder on the refund policy', () => {
    expect(pageMain(refunds)).not.toContain('[Placeholder')
  })

  it('links refund policy and safety from both footers and lists card brands on the public site', () => {
    for (const variant of ['minimal', 'marketing'] as const) {
      const footer = renderToStaticMarkup(
        createElement(SiteFooter, { variant })
      )
      expect(footer).toContain('href="/privacy"')
      expect(footer).toContain('href="/terms"')
      expect(footer).toContain('href="/code-of-conduct"')
      expect(footer).toContain('href="/data-deletion"')
      expect(footer).toContain('href="/refund-policy"')
      expect(footer).toContain('href="/safety"')
      expect(footer).toContain('href="/law-enforcement"')
      expect(footer).toContain('href="/reporting"')
      expect(footer).toContain('Refund Policy')
      expect(footer).toContain('>Safety<')
      expect(footer).toContain(
        'Huntsville Social Club is operated by Heartwork Creative Company LLC'
      )
      expect(footer).toContain('hello@huntsvillesocialclub.com')
      expect(footer).toContain('(256) 434-1563')
      expect(footer).not.toMatch(DASH_CHARACTERS)
    }

    const marketing = renderToStaticMarkup(
      createElement(SiteFooter, { variant: 'marketing' })
    )
    const minimal = renderToStaticMarkup(
      createElement(SiteFooter, { variant: 'minimal' })
    )
    expect(marketing).toContain(
      'We accept Visa, Mastercard, American Express, and Discover'
    )
    expect(minimal).not.toContain('We accept Visa')
  })
})
