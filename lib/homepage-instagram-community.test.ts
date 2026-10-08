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
  HOMEPAGE_INSTAGRAM_POST_SLOTS,
  HOMEPAGE_INSTAGRAM_UNCONFIGURED_LABEL,
  HSC_INSTAGRAM_PROFILE_URL,
  homepageInstagramLinkLabel,
  isConfiguredInstagramPost,
  type HomepageInstagramTile,
} from '@/lib/homepage-instagram-community'

const repoRoot = join(__dirname, '..')

const configuredTile = (
  id: string,
  alt: string
): HomepageInstagramTile => ({
  image: `/brand/instagram/${id}.jpg`,
  alt,
  href: `https://www.instagram.com/p/${id}/`,
})

describe('homepage Instagram community section', () => {
  const page = readFileSync(join(repoRoot, 'app/page.tsx'), 'utf8')
  const content = readFileSync(
    join(repoRoot, 'components/marketing/public-home-content.tsx'),
    'utf8'
  )
  const section = readFileSync(
    join(repoRoot, 'components/marketing/homepage-instagram-community.tsx'),
    'utf8'
  )
  const footer = readFileSync(
    join(repoRoot, 'components/shell/site-footer.tsx'),
    'utf8'
  )

  it('reuses homepage color classes and does not hard-code a new palette', () => {
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(section).toContain('bg-background')
    expect(section).toContain('text-foreground')
    expect(section).toContain('text-muted-foreground')
    expect(section).toContain('hero-eyebrow')
    expect(section).toContain('border-border')
    expect(section).toContain('border-white/10')
    expect(section).toContain('marketingButtonPrimaryClassName')
    expect(section).toContain('focus-visible:ring-accent/50')
    expect(section).toContain('focus-visible:ring-offset-background')
  })

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
    expect(content).toContain('id="why-exists-heading"')
    expect(content).toContain('id="membership-value-heading"')
  })

  it('keeps the approved copy and profile button while the five post slots are empty', () => {
    expect(HOMEPAGE_INSTAGRAM_POST_SLOTS).toHaveLength(5)
    expect(HOMEPAGE_INSTAGRAM_POST_SLOTS.every((tile) => !isConfiguredInstagramPost(tile))).toBe(
      true
    )

    const html = renderToStaticMarkup(createElement(HomepageInstagramCommunity))

    expect(html).toContain(HOMEPAGE_INSTAGRAM_EYEBROW)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_HEADING)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_BODY)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_HANDLE)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_CTA)
    expect(html).toContain(
      `href="${HSC_INSTAGRAM_PROFILE_URL}" target="_blank" rel="noreferrer"`
    )
    expect(html.match(/<li>/g)).toHaveLength(5)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_UNCONFIGURED_LABEL)
    expect(html).not.toContain('<img')
    expect(html).not.toContain(HOMEPAGE_INSTAGRAM_OVERLAY_LABEL)
    expect(html).not.toMatch(/live feed|latest posts|instagram post thumbnail/i)
    expect(html).not.toContain('/brand/hsc-event-wine.jpg')
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('md:grid-cols-3')
    expect(html).toContain('lg:grid-cols-5')
    expect(section).toContain('motion-reduce:transition-none')
    expect(section).toContain('motion-reduce:group-hover:scale-100')
  })

  it('requires a local image, alt text, and an individual post permalink', () => {
    const ready = configuredTile('Abc123XYZ', 'Guests gathered around a candlelit table')
    expect(isConfiguredInstagramPost(ready)).toBe(true)
    expect(isConfiguredInstagramPost({ ...ready, image: '' })).toBe(false)
    expect(isConfiguredInstagramPost({ ...ready, image: 'https://example.com/a.jpg' })).toBe(
      false
    )
    expect(isConfiguredInstagramPost({ ...ready, alt: ' ' })).toBe(false)
    expect(isConfiguredInstagramPost({ ...ready, alt: HOMEPAGE_INSTAGRAM_HANDLE })).toBe(
      false
    )
    expect(isConfiguredInstagramPost({ ...ready, href: '' })).toBe(false)
    expect(
      isConfiguredInstagramPost({ ...ready, href: HSC_INSTAGRAM_PROFILE_URL })
    ).toBe(false)
    expect(
      isConfiguredInstagramPost({
        ...ready,
        href: 'https://www.instagram.com/huntsvillesocialclub',
      })
    ).toBe(false)

    const html = renderToStaticMarkup(
      createElement(HomepageInstagramCommunity, {
        tiles: [
          ready,
          { ...ready, href: HSC_INSTAGRAM_PROFILE_URL, alt: 'A different gathering' },
        ],
      })
    )

    expect(html).toContain(`alt="${ready.alt}"`)
    expect(html).toContain(`aria-label="${homepageInstagramLinkLabel(ready.alt)}"`)
    expect(html).toContain(`href="${ready.href}" target="_blank" rel="noreferrer"`)
    expect(html).toContain(HOMEPAGE_INSTAGRAM_OVERLAY_LABEL)
    expect(html).toContain('motion-reduce:transition-none')
    expect(html).toContain('motion-reduce:group-hover:scale-100')
    expect(html).toContain(HOMEPAGE_INSTAGRAM_UNCONFIGURED_LABEL)
    expect(html.match(new RegExp(`href="${HSC_INSTAGRAM_PROFILE_URL}"`, 'g'))).toHaveLength(
      1
    )
  })
})
