import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MetaPixel } from '@/components/analytics/MetaPixel'
import { shouldTrackRoutePageView } from '@/components/analytics/MetaPixelPageView'
import {
  HSC_APPLICATION_CONTENT,
  META_APPLICATION_DEDUPE_KEYS,
  applicationSubmitSucceeded,
  clearMetaPixelDedupeForTests,
  event,
  metaPixelId,
  metaPixelScript,
  pageview,
  trackApplicationCompleteRegistration,
  trackApplicationLead,
  trackApplicationViewContent,
  type MetaPixelEventName,
} from '@/lib/meta-pixel'

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
  clearMetaPixelDedupeForTests()
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID
  delete (globalThis as { window?: unknown }).window
  vi.useRealTimers()
})

function installBrowser() {
  const calls: unknown[][] = []
  const storage = new Map<string, string>()
  const fbq = (...args: unknown[]) => {
    calls.push(args)
  }
  Object.assign(globalThis, {
    window: {
      fbq,
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
      },
      setInterval: (fn: () => void, delay?: number) => globalThis.setInterval(fn, delay),
      clearInterval: (id: ReturnType<typeof setInterval>) => globalThis.clearInterval(id),
      setTimeout: (fn: () => void, delay?: number) => globalThis.setTimeout(fn, delay),
    },
  })
  return { calls, storage }
}

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

  it('sends each application event once with fixed non-identifying parameters', () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    const { calls, storage } = installBrowser()

    trackApplicationViewContent()
    trackApplicationViewContent()
    trackApplicationLead()
    trackApplicationLead()
    trackApplicationCompleteRegistration()
    trackApplicationCompleteRegistration()

    expect(calls).toEqual([
      ['track', 'ViewContent', HSC_APPLICATION_CONTENT],
      ['track', 'Lead'],
      ['track', 'CompleteRegistration', HSC_APPLICATION_CONTENT],
    ])
    expect([...storage.values()]).toEqual(['1', '1', '1'])
    expect(JSON.stringify([...storage.entries()])).not.toMatch(/@|phone|email|user/i)
  })

  it('does not send an application event again after refresh in the same session', () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    const { calls, storage } = installBrowser()
    storage.set(META_APPLICATION_DEDUPE_KEYS.lead, '1')
    storage.set(META_APPLICATION_DEDUPE_KEYS.completeRegistration, '1')
    storage.set(META_APPLICATION_DEDUPE_KEYS.viewContent, '1')

    trackApplicationLead()
    trackApplicationCompleteRegistration()
    trackApplicationViewContent()

    expect(calls).toEqual([])
  })

  it('waits for fbq and still sends ViewContent only once', () => {
    vi.useFakeTimers()
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    const calls: unknown[][] = []
    const storage = new Map<string, string>()
    const browser: {
      fbq?: (...args: unknown[]) => void
      sessionStorage: {
        getItem: (key: string) => string | null
        setItem: (key: string, value: string) => void
      }
      setInterval: (fn: () => void, delay?: number) => ReturnType<typeof setInterval>
      clearInterval: (id: ReturnType<typeof setInterval>) => void
    } = {
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value)
        },
      },
      setInterval: (fn, delay) => globalThis.setInterval(fn, delay),
      clearInterval: (id) => globalThis.clearInterval(id),
    }
    Object.assign(globalThis, { window: browser })

    trackApplicationViewContent()
    expect(calls).toEqual([])
    browser.fbq = (...args: unknown[]) => {
      calls.push(args)
    }
    vi.advanceTimersByTime(200)

    expect(calls).toEqual([['track', 'ViewContent', HSC_APPLICATION_CONTENT]])
    vi.advanceTimersByTime(2000)
    expect(calls).toHaveLength(1)
  })

  it('drops a content name that is not the fixed application label', () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    const calls = installFbq()
    event('ViewContent', {
      parameters: {
        content_name: 'Ada Lovelace' as 'HSC Application',
        content_category: 'Membership Application',
      },
    })
    expect(calls).toEqual([
      ['track', 'ViewContent', { content_category: 'Membership Application' }],
    ])
  })

  it('accepts only the persisted application success result', () => {
    expect(applicationSubmitSucceeded({ success: true })).toBe(true)
    expect(applicationSubmitSucceeded({ error: 'This application cannot be submitted right now.' })).toBe(
      false,
    )
    expect(applicationSubmitSucceeded({ success: true, error: 'failed' })).toBe(false)
  })

  it('queues CompleteRegistration before navigation and stores the flag after fbq', async () => {
    vi.useFakeTimers()
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    const calls: unknown[][] = []
    const storage = new Map<string, string>()
    const order: string[] = []
    Object.assign(globalThis, {
      window: {
        fbq: (...args: unknown[]) => {
          order.push('fbq')
          calls.push(args)
        },
        sessionStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value)
          },
        },
        setInterval: (fn: () => void, delay?: number) => globalThis.setInterval(fn, delay),
        clearInterval: (id: ReturnType<typeof setInterval>) => globalThis.clearInterval(id),
        setTimeout: (fn: () => void, delay?: number) => globalThis.setTimeout(fn, delay),
      },
    })

    const pending = trackApplicationCompleteRegistration().then((sent) => {
      order.push('navigate')
      return sent
    })
    expect(storage.get(META_APPLICATION_DEDUPE_KEYS.completeRegistration)).toBe('1')
    expect(calls).toEqual([['track', 'CompleteRegistration', HSC_APPLICATION_CONTENT]])
    await vi.advanceTimersByTimeAsync(0)
    await expect(pending).resolves.toBe(true)
    expect(order).toEqual(['fbq', 'navigate'])
  })

  it('does not store CompleteRegistration when fbq never becomes available', async () => {
    vi.useFakeTimers()
    process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID
    const storage = new Map<string, string>()
    Object.assign(globalThis, {
      window: {
        sessionStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value)
          },
        },
        setInterval: (fn: () => void, delay?: number) => globalThis.setInterval(fn, delay),
        clearInterval: (id: ReturnType<typeof setInterval>) => globalThis.clearInterval(id),
        setTimeout: (fn: () => void, delay?: number) => globalThis.setTimeout(fn, delay),
      },
    })

    const pending = trackApplicationCompleteRegistration()
    expect(storage.has(META_APPLICATION_DEDUPE_KEYS.completeRegistration)).toBe(false)
    await vi.advanceTimersByTimeAsync(300)
    await expect(pending).resolves.toBe(false)
    expect(storage.has(META_APPLICATION_DEDUPE_KEYS.completeRegistration)).toBe(false)
  })

  it('places conversion calls only after confirmed success', () => {
    const signup = readFileSync(join(repoRoot, 'app/signup/page.tsx'), 'utf8')
    const form = readFileSync(
      join(repoRoot, 'app/(club)/application/application-form.tsx'),
      'utf8',
    )
    const status = readFileSync(
      join(repoRoot, 'app/(club)/application/status/page.tsx'),
      'utf8',
    )
    const login = readFileSync(join(repoRoot, 'app/login/page.tsx'), 'utf8')

    expect(signup.indexOf('trackApplicationViewContent()')).toBeGreaterThan(-1)
    expect(signup.indexOf('trackApplicationLead()')).toBeGreaterThan(
      signup.indexOf('if (signUpError)'),
    )
    expect(form.indexOf('await trackApplicationCompleteRegistration()')).toBeGreaterThan(
      form.indexOf('applicationSubmitSucceeded(result)'),
    )
    expect(form.indexOf("router.push('/application/status?submitted=1')")).toBeGreaterThan(
      form.indexOf('await trackApplicationCompleteRegistration()'),
    )
    expect(status).not.toContain('trackApplication')
    expect(login).not.toContain('trackApplication')
    expect(form).not.toContain('trackApplicationViewContent')
    expect(form).not.toContain('trackApplicationLead')
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
