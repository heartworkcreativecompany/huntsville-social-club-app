import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { MetaPixel } from '@/components/analytics/MetaPixel'
import { shouldTrackRoutePageView } from '@/components/analytics/MetaPixelPageView'
import { event, metaPixelId, metaPixelScript, pageview, type MetaPixelEventName } from '@/lib/meta-pixel'

const PIXEL_ID = '123456789012345'
const repoRoot = join(__dirname, '..')

function installFbq() {
  const calls: unknown[][] = []
  const fbq = (...args: unknown[]) => {
    calls.push(args)
  }
  Object.assign(globalThis, { window: { fbq } })
  return calls
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID
  delete (globalThis as { window?: unknown }).window
})

describe('meta pixel', () => {
  it('reads a numeric pixel id and ignores any other value', () => {
    expect(metaPixelId()).toBeNull()
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'not-a-pixel'
    expect(metaPixelId()).toBeNull()
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    expect(metaPixelId()).toBe(PIXEL_ID)
  })

  it('no-ops without a browser, pixel id, or fbq', () => {
    pageview()
    installFbq()
    pageview()
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    delete (globalThis as { window?: unknown }).window
    expect(() => pageview()).not.toThrow()
  })

  it('sends PageView through fbq and drops private parameters', () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    const calls = installFbq()

    pageview()
    event('ViewContent', {
      eventID: 'lead-event-1',
      parameters: {
        content_category: 'events',
        content_type: 'member@example.com',
        status: '555-123-4567',
        value: 12,
        ...({ email: 'member@example.com', phone: '2565550100', name: 'Ada' } as object),
      },
    })
    event('Purchase' as MetaPixelEventName)

    expect(calls).toEqual([
      ['track', 'PageView'],
      [
        'track',
        'ViewContent',
        { content_category: 'events', value: 12 },
        { eventID: 'lead-event-1' },
      ],
    ])
  })

  it('builds the website bootstrap without a PageView call', () => {
    expect(metaPixelScript('abc')).toBeNull()
    const script = metaPixelScript(PIXEL_ID)
    expect(script).toContain('https://connect.facebook.net/en_US/fbevents.js')
    expect(script).toContain(`fbq('init','${PIXEL_ID}')`)
    expect(script).not.toContain("fbq('track'")
  })

  it('renders the noscript fallback from the env pixel id', () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    const html = renderToStaticMarkup(createElement(MetaPixel))
    expect(html).toContain(
      `https://www.facebook.com/tr?id=${PIXEL_ID}&amp;ev=PageView&amp;noscript=1`,
    )
    expect(html).toContain('display:none')
  })

  it('renders nothing when the pixel id is missing', () => {
    expect(renderToStaticMarkup(createElement(MetaPixel))).toBe('')
  })

  it('tracks later route changes and skips the initial URL', () => {
    expect(shouldTrackRoutePageView(null, '/')).toBe(false)
    expect(shouldTrackRoutePageView('/', '/')).toBe(false)
    expect(shouldTrackRoutePageView('/', '/pricing')).toBe(true)
    expect(shouldTrackRoutePageView('/pricing', '/pricing?plan=connect')).toBe(true)
  })

  it('keeps the pixel id in the env example only', () => {
    const example = readFileSync(join(repoRoot, '.env.example'), 'utf8')
    const match = example.match(/^NEXT_PUBLIC_META_PIXEL_ID=(\d{15,16})$/m)
    expect(match?.[1]).toBeTruthy()
    const id = match?.[1] ?? ''
    expect(example.split(id)).toHaveLength(2)
    const sources = [
      'lib/meta-pixel.ts',
      'lib/meta-pixel.test.ts',
      'components/analytics/MetaPixel.tsx',
      'components/analytics/MetaPixelPageView.tsx',
      'app/layout.tsx',
      'docs/meta-pixel.md',
    ]
    for (const file of sources) {
      expect(readFileSync(join(repoRoot, file), 'utf8')).not.toContain(id)
    }
  })
})
