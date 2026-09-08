import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyNotificationClick,
  planNotificationClick,
  sharedNotificationPanelStaysOpenAfterMousedown,
} from '@/lib/notification-click'

describe('dual responsive bell mousedown race', () => {
  it('lets a hidden twin close shared state before the visible row click', () => {
    expect(
      sharedNotificationPanelStaysOpenAfterMousedown({
        mountedPanelContainsTarget: [true, false],
      })
    ).toBe(false)
  })

  it('keeps the panel open when only the visible bell owns the document listener', () => {
    expect(
      sharedNotificationPanelStaysOpenAfterMousedown({
        mountedPanelContainsTarget: [true],
      })
    ).toBe(true)
  })

  it('gates navigation with isSafeInAppHref from notification-ui', () => {
    const source = readFileSync(join(__dirname, 'notification-click.ts'), 'utf8')
    expect(source).toContain("from '@/lib/notification-ui'")
    expect(source).toContain('isSafeInAppHref(notification.href)')
  })
})

function unread(href: string | null) {
  return { id: 'n1', href, readAt: null }
}

function applyClick(
  notification: { id: string; href: string | null; readAt: string | null },
  pendingIds = new Set<string>(),
  persistRead: () => Promise<unknown> = async () => undefined
) {
  const closePanel = vi.fn()
  const markOptimisticRead = vi.fn()
  const navigate = vi.fn()
  const persist = vi.fn(persistRead)
  const plan = planNotificationClick(notification, pendingIds)

  applyNotificationClick(plan, pendingIds, notification.id, {
    closePanel,
    markOptimisticRead,
    persistRead: persist,
    navigate,
  })

  return { closePanel, markOptimisticRead, navigate, persist, pendingIds, plan }
}

describe('safe notification click', () => {
  it('closes, marks unread /messages/... once, and pushes immediately', async () => {
    let release!: () => void
    const persistRead = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })

    const { closePanel, markOptimisticRead, navigate, persist, pendingIds } =
      applyClick(unread('/messages/thread-1'), new Set(), persistRead)

    expect(closePanel).toHaveBeenCalledTimes(1)
    expect(markOptimisticRead).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/messages/thread-1')
    expect(persist).toHaveBeenCalledTimes(1)
    expect(pendingIds.has('n1')).toBe(true)

    release()
    await Promise.resolve()
    await Promise.resolve()
  })

  it('does not wait for mark-read to finish before navigating', async () => {
    const order: string[] = []
    let release!: () => void
    const pendingIds = new Set<string>()
    const plan = planNotificationClick(unread('/matches/dating'), pendingIds)
    applyNotificationClick(plan, pendingIds, 'n1', {
      closePanel: () => {
        order.push('close')
      },
      markOptimisticRead: () => {
        order.push('optimistic')
      },
      persistRead: () => {
        order.push('persist-start')
        return new Promise<void>((resolve) => {
          release = () => {
            order.push('persist-done')
            resolve()
          }
        })
      },
      navigate: (href) => {
        order.push(`navigate:${href}`)
      },
    })

    expect(order).toEqual([
      'close',
      'optimistic',
      'navigate:/matches/dating',
      'persist-start',
    ])
    expect(order).not.toContain('persist-done')
    release()
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual([
      'close',
      'optimistic',
      'navigate:/matches/dating',
      'persist-start',
      'persist-done',
    ])
  })

  it('navigates unread /matches/friends the same way', () => {
    const { navigate, persist, closePanel } = applyClick(
      unread('/matches/friends')
    )
    expect(closePanel).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/matches/friends')
  })

  it('ignores a second click for the same notification while persist is in flight', () => {
    const pendingIds = new Set<string>()
    const first = applyClick(unread('/messages/1'), pendingIds, () =>
      new Promise(() => undefined)
    )
    const second = applyClick(unread('/messages/1'), pendingIds)

    expect(first.navigate).toHaveBeenCalledTimes(1)
    expect(first.persist).toHaveBeenCalledTimes(1)
    expect(second.plan.skip).toBe(true)
    expect(second.navigate).not.toHaveBeenCalled()
    expect(second.persist).not.toHaveBeenCalled()
    expect(second.closePanel).not.toHaveBeenCalled()
  })

  it('swallows persist failures so they are not unhandled rejections', async () => {
    const { navigate } = applyClick(unread('/messages/1'), new Set(), async () => {
      throw new Error('persistence failed')
    })
    expect(navigate).toHaveBeenCalledWith('/messages/1')
    await Promise.resolve()
    await Promise.resolve()
  })

  it('still navigates an already-read safe href without marking again', () => {
    const { persist, navigate, markOptimisticRead } = applyClick({
      id: 'n1',
      href: '/profile',
      readAt: '2026-09-01T00:00:00.000Z',
    })
    expect(markOptimisticRead).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/profile')
  })
})

describe('unsafe or missing href', () => {
  it.each([
    '',
    '//evil.example',
    'https://example.com',
    'javascript:alert(1)',
  ])('never navigates %s and still marks unread', (href) => {
    const { navigate, persist, markOptimisticRead, closePanel } = applyClick(
      unread(href)
    )
    expect(navigate).not.toHaveBeenCalled()
    expect(closePanel).toHaveBeenCalledTimes(1)
    expect(markOptimisticRead).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })
})
