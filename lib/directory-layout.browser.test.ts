import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const REVIEW_PORT = 3456
const REVIEW_ORIGIN = `http://127.0.0.1:${REVIEW_PORT}`
const DIRECTORY = `${REVIEW_ORIGIN}/directory-layout-review?q=Ada&browse=industry&industry=aerospace_aviation_space&page=2`

let reviewServer: ChildProcess | null = null

beforeAll(async () => {
  try {
    const existing = await fetch(DIRECTORY)
    if (existing.status === 200) return
  } catch {
    // Start a review server only when one is not already listening.
  }
  reviewServer = spawn(
    'npx',
    ['next', 'dev', '--port', String(REVIEW_PORT)],
    {
      cwd: process.cwd(),
      stdio: 'ignore',
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'local-build-placeholder',
        DIRECTORY_LAYOUT_REVIEW: '1',
      },
    }
  )
  await waitForReviewServer()
}, 90000)

afterAll(() => {
  reviewServer?.kill()
})

type CdpMessage = {
  id?: number
  result?: unknown
  error?: { message?: string }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForReviewServer() {
  const started = Date.now()
  while (Date.now() - started < 60000) {
    try {
      const response = await fetch(DIRECTORY)
      if (response.status === 200) return
    } catch {
      // The review server is started separately for this local check.
    }
    await sleep(250)
  }
  throw new Error(
    `Directory layout review server is not running on port ${REVIEW_PORT}`
  )
}

function startChrome(port: number): ChildProcess {
  return spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--remote-debugging-port=${port}`,
      '--user-data-dir=/tmp/hsc-directory-layout-chrome',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
}

class Cdp {
  private nextId = 0
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private socket: WebSocket

  constructor(socket: WebSocket) {
    this.socket = socket
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage
      if (!message.id) return
      const waiter = this.pending.get(message.id)
      if (!waiter) return
      this.pending.delete(message.id)
      if (message.error) waiter.reject(new Error(message.error.message ?? 'CDP error'))
      else waiter.resolve(message.result)
    })
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ) {
    const id = ++this.nextId
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.socket.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      })
    )
    return result
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = (await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: T }; exceptionDetails?: { text?: string } }
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Evaluation failed')
    }
    return result.result?.value as T
  }
}

async function connect(port: number): Promise<Cdp> {
  const started = Date.now()
  let version: { webSocketDebuggerUrl: string } | null = null
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        version = (await response.json()) as { webSocketDebuggerUrl: string }
        break
      }
    } catch {
      await sleep(100)
    }
  }
  if (!version) throw new Error('Chrome DevTools endpoint did not start')
  const socket = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve())
    socket.addEventListener('error', () => reject(new Error('Chrome socket failed')))
  })
  const cdp = new Cdp(socket)
  const target = (await cdp.send('Target.createTarget', { url: 'about:blank' })) as {
    targetId: string
  }
  const attached = (await cdp.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  })) as { sessionId: string }
  return new CdpSession(socket, attached.sessionId)
}

class CdpSession extends Cdp {
  constructor(
    socket: WebSocket,
    private sessionId: string
  ) {
    super(socket)
  }

  send(method: string, params: Record<string, unknown> = {}) {
    return super.send(method, params, this.sessionId)
  }
}

describe('directory layout browser behavior', () => {
  it('preserves directory history, restores the card, and lays out two mobile columns', async () => {
    await waitForReviewServer()
    const chrome = startChrome(9333)
    try {
      const cdp = await connect(9333)
      await cdp.send('Page.enable')
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      })
      await cdp.send('Page.navigate', { url: DIRECTORY })
      await sleep(800)
      const mobile = await cdp.evaluate<{
        columns: string
        bioHidden: boolean
        hasPrivateZip: boolean
        href: string
        overflow: boolean
      }>(`(() => {
        const card = document.querySelector('[data-directory-card="fixture-long"]')
        const grid = card.closest('ul')
        const bio = card.querySelector('p.hidden')
        const bioStyle = getComputedStyle(bio)
        return {
          columns: getComputedStyle(grid).gridTemplateColumns,
          bioHidden: bioStyle.display === 'none',
          hasPrivateZip: document.body.innerText.includes('35801') || document.body.innerText.includes('Private City'),
          href: card.getAttribute('href'),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        }
      })()`)

      expect(mobile.columns.split(' ').length).toBe(2)
      expect(mobile.bioHidden).toBe(true)
      expect(mobile.hasPrivateZip).toBe(false)
      expect(mobile.href).toContain('page=2')
      expect(mobile.href).toContain('q=Ada')
      expect(mobile.href).toContain('browse=industry')
      expect(mobile.overflow).toBe(false)

      const enlargedColumns = await cdp.evaluate<number>(`(() => {
        document.documentElement.style.fontSize = '24px'
        const grid = document.querySelector('[data-directory-card]').closest('ul')
        const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
        document.documentElement.style.fontSize = ''
        return columns
      })()`)
      expect(enlargedColumns).toBe(1)

      const focus = await cdp.evaluate<{ outlineWidth: string; outlineStyle: string }>(`(() => {
        const card = document.querySelector('[data-directory-card="fixture-ada"]')
        card.focus({ focusVisible: true })
        const style = getComputedStyle(card)
        return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle }
      })()`)
      expect(focus.outlineStyle).not.toBe('none')
      expect(parseFloat(focus.outlineWidth)).toBeGreaterThan(0)

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 320,
        height: 700,
        deviceScaleFactor: 2,
        mobile: true,
      })
      await sleep(200)
      const narrowColumns = await cdp.evaluate<number>(`(() => {
        const grid = document.querySelector('[data-directory-card]').closest('ul')
        return getComputedStyle(grid).gridTemplateColumns.split(' ').length
      })()`)
      expect(narrowColumns).toBe(1)

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await cdp.send('Page.navigate', { url: DIRECTORY })
      await sleep(800)
      const beforeScroll = await cdp.evaluate<number>(`(() => {
        const scroller = document.querySelector('[data-club-content-scroll]')
        const card = document.querySelector('[data-directory-card="fixture-12"]')
        const delta = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        scroller.scrollTop += delta - 16
        return scroller.scrollTop
      })()`)
      expect(beforeScroll).toBeGreaterThan(200)

      await cdp.evaluate<void>(`document.querySelector('[data-directory-card="fixture-12"]').click()`)
      await sleep(800)
      const profileUrl = await cdp.evaluate<string>('location.href')
      expect(profileUrl).toContain('/directory-layout-review/fixture-12')
      expect(profileUrl).toContain('page=2')
      expect(profileUrl).toContain('q=Ada')

      const backHref = await cdp.evaluate<string>(
        `document.querySelector('[data-review-back]').getAttribute('href')`
      )
      expect(backHref).toBe(
        '/directory-layout-review?q=Ada&browse=industry&industry=aerospace_aviation_space&page=2'
      )

      await cdp.evaluate<void>('history.back()')
      await sleep(900)
      const returned = await cdp.evaluate<{
        href: string
        scrollTop: number
        cardTop: number
        covered: boolean
      }>(`(() => {
        const scroller = document.querySelector('[data-club-content-scroll]')
        const card = document.querySelector('[data-directory-card="fixture-12"]')
        const rect = card.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, Math.min(window.innerHeight - 40, rect.bottom - 20))
        return {
          href: location.pathname + location.search,
          scrollTop: scroller.scrollTop,
          cardTop: rect.top,
          covered: hit !== card && !card.contains(hit)
        }
      })()`)
      expect(returned.href).toContain('page=2')
      expect(returned.href).toContain('q=Ada')
      expect(returned.scrollTop).toBeGreaterThan(100)
      expect(returned.cardTop).toBeLessThan(120)
      expect(returned.covered).toBe(false)

      await cdp.evaluate<void>(`document.querySelector('[data-review-back]') ? null : document.querySelector('[data-directory-card="fixture-ada"]').click()`)
      await sleep(500)
      if ((await cdp.evaluate<string>('location.pathname')).includes('fixture-ada')) {
        await cdp.evaluate<void>(`document.querySelector('[data-review-back]').click()`)
        await sleep(800)
        const linked = await cdp.evaluate<string>('location.pathname + location.search')
        expect(linked).toContain('page=2')
        expect(linked).toContain('q=Ada')
      }
    } finally {
      chrome.kill()
    }
  }, 60000)

  it('keeps portrait faces, grid rows, and return edges without a second forced scroll', async () => {
    await waitForReviewServer()
    const chrome = startChrome(9340)
    try {
      const cdp = await connect(9340)
      await cdp.send('Page.enable')
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      })
      await cdp.send('Page.navigate', { url: DIRECTORY })
      await sleep(1000)
      const faces = await cdp.evaluate<{ id: string; visible: boolean }[]>(`(async () => {
        function hasFace(img) {
          const canvas = document.createElement('canvas')
          canvas.width = img.clientWidth
          canvas.height = img.clientHeight
          const context = canvas.getContext('2d')
          context.drawImage(img, 0, 0, canvas.width, canvas.height)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index] > 220 && pixels[index + 1] < 40 && pixels[index + 2] > 140) {
              return true
            }
          }
          return false
        }
        const ids = ['fixture-ada', 'fixture-long', 'fixture-4']
        await Promise.all(ids.map(async (id) => {
          const img = document.querySelector('[data-directory-card="' + id + '"] img')
          if (img && !img.complete) {
            await new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true })
              img.addEventListener('error', resolve, { once: true })
            })
          }
        }))
        return ids.map((id) => {
          const img = document.querySelector('[data-directory-card="' + id + '"] img')
          return { id, visible: Boolean(img && img.clientWidth > 0 && hasFace(img)) }
        })
      })()`)
      expect(faces).toEqual([
        { id: 'fixture-ada', visible: true },
        { id: 'fixture-long', visible: true },
        { id: 'fixture-4', visible: true },
      ])

      const nested = await cdp.evaluate<number>(
        `document.querySelector('[data-directory-card="fixture-ada"]').querySelectorAll('a,button').length`
      )
      expect(nested).toBe(0)

      const newTab = await cdp.evaluate<{ stored: boolean; followed: boolean }>(`(() => {
        sessionStorage.removeItem('hsc-directory-return-scroll')
        const card = document.querySelector('[data-directory-card="fixture-ada"]')
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
        const followed = card.dispatchEvent(event)
        return {
          stored: sessionStorage.getItem('hsc-directory-return-scroll') !== null,
          followed,
        }
      })()`)
      expect(newTab.stored).toBe(false)
      expect(newTab.followed).toBe(true)

      const historyBefore = await cdp.evaluate<number>('history.length')
      await cdp.evaluate<void>(
        `document.querySelector('[data-directory-card="fixture-ada"]').focus({ focusVisible: true })`
      )
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      })
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      })
      await sleep(200)
      const afterKey = await cdp.evaluate<string>('location.pathname')
      if (!afterKey.includes('fixture-ada')) {
        await cdp.evaluate<void>(
          `document.querySelector('[data-directory-card="fixture-ada"]').focus({ focusVisible: true })`
        )
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
        })
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
        })
        await sleep(800)
      }
      const entered = await cdp.evaluate<{ path: string; length: number }>(
        `({ path: location.pathname, length: history.length })`
      )
      expect(entered.path).toContain('/directory-layout-review/fixture-ada')
      expect(entered.length).toBe(historyBefore + 1)
      await cdp.evaluate<void>('history.back()')
      await sleep(700)

      await cdp.evaluate<void>(`(() => {
        const original = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) {
          if (key === 'hsc-directory-return-scroll') throw new Error('blocked')
          return original.call(this, key, value)
        }
        document.querySelector('[data-directory-card="fixture-blank"]').click()
        Storage.prototype.setItem = original
      })()`)
      await sleep(800)
      expect(await cdp.evaluate<string>('location.pathname')).toContain('fixture-blank')
      await cdp.evaluate<void>('history.back()')
      await sleep(600)

      await cdp.send('Page.navigate', {
        url: `${REVIEW_ORIGIN}/directory-layout-review/fixture-ada`,
      })
      await sleep(700)
      const direct = await cdp.evaluate<{ back: string; fallback: string }>(`({
        back: document.querySelector('[data-review-back]').getAttribute('href'),
        fallback: document.body.innerText
      })`)
      expect(direct.back).toBe('/directory-layout-review')
      expect(direct.fallback).toContain('Production fallback: /members')

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await cdp.send('Page.navigate', { url: DIRECTORY })
      await sleep(800)
      await cdp.evaluate<void>(`(() => {
        const scroller = document.querySelector('[data-club-content-scroll]')
        const card = document.querySelector('[data-directory-card="fixture-12"]')
        scroller.scrollTop += card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16
      })()`)
      const lengthBeforeSecond = await cdp.evaluate<number>('history.length')
      await cdp.evaluate<void>(`document.querySelector('[data-directory-card="fixture-12"]').click()`)
      await sleep(700)
      await cdp.evaluate<void>('history.back()')
      await sleep(900)
      const firstReturn = await cdp.evaluate<{ key: string | null; length: number }>(`({
        key: sessionStorage.getItem('hsc-directory-return-scroll'),
        length: history.length
      })`)
      expect(firstReturn.key).toBeNull()
      expect(firstReturn.length).toBe(lengthBeforeSecond + 1)
      await cdp.evaluate<void>(
        `document.querySelector('[data-club-content-scroll]').scrollTop = 0`
      )
      await cdp.evaluate<void>('history.forward()')
      await sleep(500)
      await cdp.evaluate<void>('history.back()')
      await sleep(700)
      const secondReturn = await cdp.evaluate<{ key: string | null; scrollTop: number }>(`({
        key: sessionStorage.getItem('hsc-directory-return-scroll'),
        scrollTop: document.querySelector('[data-club-content-scroll]').scrollTop
      })`)
      expect(secondReturn.key).toBeNull()
      expect(secondReturn.scrollTop).toBeLessThan(80)

      const scrollProbe = await cdp.evaluate<{
        browser: string
        zoom: number
        framePosition: string
        frameTransform: string
        scroller: string
        covered: boolean
      }>(`(() => {
        const scroller = document.querySelector('[data-club-content-scroll]')
        scroller.scrollTop = 1600
        const frame = scroller.parentElement
        const frameStyle = getComputedStyle(frame)
        const covered = [200, 720, 1200].some((x) => {
          const el = document.elementFromPoint(x, 860)
          if (!el) return true
          const style = getComputedStyle(el)
          return style.position === 'fixed' || el.closest('footer') !== null
        })
        return {
          browser: navigator.userAgent,
          zoom: window.devicePixelRatio,
          framePosition: frameStyle.position,
          frameTransform: frameStyle.transform,
          scroller: getComputedStyle(scroller).overflowY,
          covered,
        }
      })()`)
      expect(scrollProbe.framePosition).toBe('static')
      expect(scrollProbe.frameTransform).toBe('none')
      expect(scrollProbe.scroller).toBe('auto')
      expect(scrollProbe.covered).toBe(false)
      expect(scrollProbe.browser).toContain('Chrome')

      for (const width of [768, 1024, 1280, 1440]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        })
        await cdp.send('Page.navigate', { url: `${REVIEW_ORIGIN}/` })
        await sleep(800)
        const columns = await cdp.evaluate<number>(`(() => {
          const grid = document.querySelector('#membership-value-heading').parentElement.querySelector('ul')
          return getComputedStyle(grid).gridTemplateColumns.split(' ').length
        })()`)
        expect(columns).toBe(width === 768 ? 2 : 3)
      }
    } finally {
      chrome.kill()
    }
  }, 90000)
})
