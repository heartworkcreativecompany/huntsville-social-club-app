import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DataDeletionPage from '@/app/data-deletion/page'
import SiteFooter from '@/components/shell/site-footer'
import {
  DATA_DELETION_FOOTER_LABEL,
  DATA_DELETION_INCLUDE_ITEMS,
  DATA_DELETION_INSTAGRAM_AUTHORIZATION,
  DATA_DELETION_INTRO,
  DATA_DELETION_PATH,
  DATA_DELETION_QUESTIONS_HEADING,
  DATA_DELETION_REQUEST_HEADING,
  DATA_DELETION_SCOPE_HEADING,
  DATA_DELETION_SCOPE_ITEMS,
  DATA_DELETION_SUBJECT,
  DATA_DELETION_TIMING_BODY,
  DATA_DELETION_TIMING_HEADING,
  DATA_DELETION_TITLE,
  DATA_DELETION_VERIFY,
} from '@/lib/data-deletion'
import {
  MARKETING_BROWSER_ROUTES,
  isMarketingPassthroughPath,
  proxyHostAction,
} from '@/lib/hostnames'
import { SUPPORT_EMAIL } from '@/lib/site'

const repoRoot = join(__dirname, '..')
const VERIFIED_SUPPORT_EMAIL = 'hello@huntsvillesocialclub.com'

describe('data deletion instructions', () => {
  const pageSource = readFileSync(
    join(repoRoot, 'app/data-deletion/page.tsx'),
    'utf8'
  )
  const copySource = readFileSync(join(repoRoot, 'lib/data-deletion.ts'), 'utf8')
  const footerSource = readFileSync(
    join(repoRoot, 'components/shell/site-footer.tsx'),
    'utf8'
  )
  const html = renderToStaticMarkup(createElement(DataDeletionPage))

  it('is a public marketing route with no login gate', () => {
    expect(MARKETING_BROWSER_ROUTES).toContain(DATA_DELETION_PATH)
    expect(isMarketingPassthroughPath(DATA_DELETION_PATH)).toBe(true)
    expect(proxyHostAction('marketing', DATA_DELETION_PATH)).toEqual({
      type: 'next',
    })
    expect(proxyHostAction('preview', DATA_DELETION_PATH)).toEqual({
      type: 'next',
    })
    expect(pageSource).not.toMatch(/getUser|redirect\(|cookies\(/)
  })

  it('includes the required title and every section', () => {
    expect(html).toContain(DATA_DELETION_TITLE)
    expect(html).toContain(DATA_DELETION_INTRO)
    expect(html).toContain(DATA_DELETION_REQUEST_HEADING)
    expect(html).toContain(DATA_DELETION_SUBJECT)
    expect(html).toContain(DATA_DELETION_VERIFY)
    expect(html).toContain(DATA_DELETION_SCOPE_HEADING)
    expect(html).toContain(DATA_DELETION_INSTAGRAM_AUTHORIZATION)
    expect(html).toContain(DATA_DELETION_TIMING_HEADING)
    expect(html).toContain(DATA_DELETION_TIMING_BODY)
    expect(html).toContain(DATA_DELETION_QUESTIONS_HEADING)
    for (const item of [
      ...DATA_DELETION_INCLUDE_ITEMS,
      ...DATA_DELETION_SCOPE_ITEMS,
    ]) {
      expect(html).toContain(item)
    }
  })

  it('uses the existing verified support email', () => {
    expect(SUPPORT_EMAIL).toBe(VERIFIED_SUPPORT_EMAIL)
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    expect(main.match(new RegExp(`mailto:${VERIFIED_SUPPORT_EMAIL}`, 'g'))).toHaveLength(
      2
    )
    expect(html).not.toContain('[support email required]')
    expect(copySource).not.toMatch(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    )
    expect(pageSource).toContain('SUPPORT_EMAIL')
  })

  it('adds the footer link beside the existing legal links', () => {
    for (const variant of ['minimal', 'marketing'] as const) {
      const footer = renderToStaticMarkup(
        createElement(SiteFooter, { variant })
      )
      expect(footer).toContain(`href="${DATA_DELETION_PATH}"`)
      expect(footer).toContain(DATA_DELETION_FOOTER_LABEL)
      expect(footer).toContain('Privacy')
    }
    expect(footerSource).toContain('href="/privacy"')
    expect(footerSource).toContain(`href="${DATA_DELETION_PATH}"`)
  })

  it('uses one h1, logical h2 headings, and accessible lists', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toContain(`>${DATA_DELETION_TITLE}<`)
    expect(html.match(/<h2[\s>]/g)).toHaveLength(4)
    expect(html.match(/<ul[\s>]/g)).toHaveLength(2)
    expect(html.match(/<li[\s>]/g)).toHaveLength(8)
    expect(html).toContain('<main')
  })

  it('does not add a form, callback, credential, or data mutation', () => {
    const sources = `${pageSource}\n${copySource}`
    expect(html).not.toContain('<form')
    expect(sources).not.toMatch(
      /callback|webhook|access token|client_secret|supabase|insert\(|update\(|delete\(|fetch\(/i
    )
    expect(sources).not.toMatch(/instagram\.com\/p\/|graph\.instagram/i)
    expect(html).not.toMatch(/delete(?:d)? from Instagram/i)
  })
})
