import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HomepageInstagramCommunity from '@/components/marketing/homepage-instagram-community'
import {
  HOMEPAGE_INSTAGRAM_BODY,
  HOMEPAGE_INSTAGRAM_CTA,
  HOMEPAGE_INSTAGRAM_EYEBROW,
  HOMEPAGE_INSTAGRAM_HANDLE,
  HOMEPAGE_INSTAGRAM_HEADING,
  HOMEPAGE_INSTAGRAM_OVERLAY_LABEL,
  HOMEPAGE_INSTAGRAM_TILES,
  HSC_INSTAGRAM_PROFILE_URL,
  homepageInstagramLinkLabel,
} from '@/lib/homepage-instagram-community'

const repoRoot = join(__dirname, '..')

describe('homepage Instagram community section', () => {
  const page = readFileSync(join(repoRoot, 'app/page.tsx'), 'utf8')
  const content = readFileSync(
    join(repoRoot, 'components/marketing/public-home-content.tsx'),
    'utf8'
  )
  const footer = readFileSync(
    join(repoRoot, 'components/shell/site-footer.tsx'),
    'utf8'
  )

  it('renders after the final homepage section and before the footer', () => {
    const finalCta = content.indexOf('id="final-cta-heading"')
    const instagram = content.indexOf('<HomepageInstagramCommunity />')
    expect(finalCta).toBeGreaterThan(-1)
    expect(instagram).toBeGreaterThan(finalCta)
    expect(page.indexOf('<SiteFooter')).toBeGreaterThan(
      page.indexOf('<PublicHomeContent')
    )
    expect(footer).toContain('A membership community for people who want more ways to meet')
    expect(footer).not.toContain('FOLLOW ALONG')
  })

  it('renders the approved copy, profile link, and five tiles', () => {
    const html = renderToStaticMarkup(createElement(HomepageInstagramCommunity))

    expect(html).toContain(HOMEPAGE_INSTAGRAM_EYEBROW)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_HEADING)
    expect(html).toContain('id="instagram-community-heading"')
    expect(html).toContain(HOMEPAGE_INSTAGRAM_BODY)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_HANDLE)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_CTA)
    expect(html).toContain(
      `href="${HSC_INSTAGRAM_PROFILE_URL}" target="_blank" rel="noreferrer"`
    )
    expect(HOMEPAGE_INSTAGRAM_TILES).toHaveLength(5)
    expect(html.match(/<li>/g)).toHaveLength(5)
    expect(html).not.toMatch(/live feed|latest posts/i)

    const alts = HOMEPAGE_INSTAGRAM_TILES.map((tile) => tile.alt)
    expect(new Set(alts).size).toBe(5)
    for (const tile of HOMEPAGE_INSTAGRAM_TILES) {
      expect(tile.href).toBe(HSC_INSTAGRAM_PROFILE_URL)
      expect(tile.alt.toLowerCase()).not.toBe(HOMEPAGE_INSTAGRAM_HANDLE.toLowerCase())
      expect(html).toContain(`alt="${tile.alt}"`)
      expect(html).toContain(
        `aria-label="${homepageInstagramLinkLabel(tile.alt)}"`
      )
      expect(html).toContain(`href="${tile.href}" target="_blank" rel="noreferrer"`)
    }
    expect(html.match(new RegExp(HOMEPAGE_INSTAGRAM_OVERLAY_LABEL, 'g'))).toHaveLength(
      5
    )
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('motion-reduce:transition-none')
    expect(html).toContain('motion-reduce:group-hover:scale-100')
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('md:grid-cols-3')
    expect(html).toContain('lg:grid-cols-5')
  })

  it('keeps the heading, handle, and follow link when no tiles are configured', () => {
    const html = renderToStaticMarkup(
      createElement(HomepageInstagramCommunity, { tiles: [] })
    )

    expect(html).toContain(HOMEPAGE_INSTAGRAM_HEADING)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_HANDLE)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_CTA)
    expect(html).toContain(`href="${HSC_INSTAGRAM_PROFILE_URL}"`)
    expect(html).not.toContain('<li>')
    expect(html).not.toContain('<img')
  })

  it('shows a branded placeholder instead of a broken image when a tile has no image', () => {
    const html = renderToStaticMarkup(
      createElement(HomepageInstagramCommunity, {
        tiles: [
          {
            image: ' ',
            alt: 'A warm branded placeholder for a future community photo',
            href: HSC_INSTAGRAM_PROFILE_URL,
          },
        ],
      })
    )

    expect(html).toContain('A warm branded placeholder for a future community photo')
    expect(html).not.toContain('<img')
    expect(html).toContain('target="_blank" rel="noreferrer"')
  })
})
