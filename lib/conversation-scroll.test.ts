import { describe, expect, it } from 'vitest'
import {
  bindConversationReadOnVisibility,
  incomingCountAfter,
  isHistoryPrepend,
  isNearMessageBottom,
  latestJumpLabel,
  planConversationScroll,
  scrollBehaviorForJump,
  shouldMarkConversationRead,
  type ConversationVisibilityTarget,
  type MessageScrollSnapshot,
} from '@/lib/conversation-scroll'

const stuck: MessageScrollSnapshot = {
  firstId: 'a',
  lastId: 'c',
  scrollHeight: 800,
  scrollTop: 500,
  stuckToBottom: true,
}

const reading: MessageScrollSnapshot = {
  firstId: 'a',
  lastId: 'c',
  scrollHeight: 1200,
  scrollTop: 120,
  stuckToBottom: false,
}

describe('planConversationScroll', () => {
  it('pins instantly on the first layout so the newest message is in view', () => {
    const plan = planConversationScroll({
      previous: null,
      messages: [
        { id: 'a', isOwn: false },
        { id: 'b', isOwn: true },
      ],
      scrollHeight: 900,
      forceReveal: false,
    })

    expect(plan.action).toEqual({ type: 'pin', behavior: 'auto' })
    expect(plan.stuckToBottom).toBe(true)
    expect(plan.unseenIncoming).toBe(0)
  })

  it('follows a new incoming message only while already at the bottom', () => {
    const plan = planConversationScroll({
      previous: stuck,
      messages: [
        { id: 'a', isOwn: false },
        { id: 'c', isOwn: true },
        { id: 'd', isOwn: false },
      ],
      scrollHeight: 980,
      forceReveal: false,
    })

    expect(plan.action).toEqual({ type: 'pin', behavior: 'auto' })
    expect(plan.unseenIncoming).toBe(0)
  })

  it('holds position and counts incoming messages while older history is open', () => {
    const plan = planConversationScroll({
      previous: reading,
      messages: [
        { id: 'a', isOwn: false },
        { id: 'c', isOwn: true },
        { id: 'd', isOwn: false },
        { id: 'e', isOwn: false },
      ],
      scrollHeight: 1500,
      forceReveal: false,
    })

    expect(plan.action).toEqual({ type: 'hold' })
    expect(plan.stuckToBottom).toBe(false)
    expect(plan.unseenIncoming).toBe(2)
    expect(latestJumpLabel(plan.unseenIncoming)).toBe('New messages ↓')
  })

  it('reveals the latest message after the viewer sends one', () => {
    const plan = planConversationScroll({
      previous: reading,
      messages: [
        { id: 'a', isOwn: false },
        { id: 'c', isOwn: true },
        { id: 'd', isOwn: true },
      ],
      scrollHeight: 1400,
      forceReveal: true,
    })

    expect(plan.action).toEqual({ type: 'pin', behavior: 'auto' })
    expect(plan.stuckToBottom).toBe(true)
  })

  it('keeps the same pixels on screen when older messages are prepended', () => {
    const plan = planConversationScroll({
      previous: reading,
      messages: [
        { id: 'older', isOwn: false },
        { id: 'a', isOwn: false },
        { id: 'c', isOwn: true },
      ],
      scrollHeight: 1600,
      forceReveal: false,
    })

    expect(isHistoryPrepend('a', ['older', 'a', 'c'])).toBe(true)
    expect(plan.action).toEqual({
      type: 'preserve-prepend',
      scrollTop: 520,
    })
    expect(plan.stuckToBottom).toBe(false)
  })

  it('stays at the bottom when history is prepended during an anchored view', () => {
    const plan = planConversationScroll({
      previous: stuck,
      messages: [
        { id: 'older', isOwn: false },
        { id: 'a', isOwn: false },
        { id: 'c', isOwn: true },
      ],
      scrollHeight: 1100,
      forceReveal: false,
    })

    expect(plan.action).toEqual({ type: 'pin', behavior: 'auto' })
  })

  it('does not move for an unrelated rerender of the same messages', () => {
    const plan = planConversationScroll({
      previous: reading,
      messages: [
        { id: 'a', isOwn: false },
        { id: 'c', isOwn: true },
      ],
      scrollHeight: 1200,
      forceReveal: false,
    })

    expect(plan.action).toEqual({ type: 'hold' })
    expect(plan.unseenIncoming).toBe(0)
    expect(plan.stuckToBottom).toBe(false)
  })
})

describe('message scroll helpers', () => {
  it('treats a small gap above the composer as the bottom', () => {
    expect(
      isNearMessageBottom({ scrollHeight: 400, scrollTop: 180, clientHeight: 200 })
    ).toBe(true)
    expect(
      isNearMessageBottom({ scrollHeight: 800, scrollTop: 100, clientHeight: 200 })
    ).toBe(false)
  })

  it('ignores the viewer’s own messages in the unseen count', () => {
    expect(
      incomingCountAfter(
        [
          { id: 'a', isOwn: false },
          { id: 'b', isOwn: true },
          { id: 'c', isOwn: false },
        ],
        'a'
      )
    ).toBe(1)
  })

  it('uses an instant jump when reduced motion is requested', () => {
    expect(scrollBehaviorForJump(true)).toBe('auto')
    expect(scrollBehaviorForJump(false)).toBe('smooth')
    expect(latestJumpLabel(0)).toBe('Jump to latest')
  })

  it('marks messages read only while the latest messages are in view', () => {
    expect(
      shouldMarkConversationRead({
        canMarkRead: true,
        viewingLatest: true,
        hasUnreadIncoming: true,
        documentVisible: true,
      })
    ).toBe(true)
    expect(
      shouldMarkConversationRead({
        canMarkRead: true,
        viewingLatest: false,
        hasUnreadIncoming: true,
        documentVisible: true,
      })
    ).toBe(false)
    expect(
      shouldMarkConversationRead({
        canMarkRead: false,
        viewingLatest: true,
        hasUnreadIncoming: true,
        documentVisible: true,
      })
    ).toBe(false)
    expect(
      shouldMarkConversationRead({
        canMarkRead: true,
        viewingLatest: true,
        hasUnreadIncoming: false,
        documentVisible: true,
      })
    ).toBe(false)
    expect(
      shouldMarkConversationRead({
        canMarkRead: true,
        viewingLatest: true,
        hasUnreadIncoming: true,
        documentVisible: false,
      })
    ).toBe(false)
  })
})

class FakeVisibilityDocument implements ConversationVisibilityTarget {
  visibilityState: 'visible' | 'hidden' = 'hidden'
  private listeners = new Set<() => void>()

  addEventListener(_type: 'visibilitychange', listener: () => void) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void) {
    this.listeners.delete(listener)
  }

  become(state: 'visible' | 'hidden') {
    this.visibilityState = state
    for (const listener of this.listeners) listener()
  }
}

describe('hidden-tab read receipts', () => {
  it('does not mark incoming messages while the document is hidden', () => {
    const marked: string[] = []
    const target = new FakeVisibilityDocument()
    bindConversationReadOnVisibility({
      target,
      conversationId: 'thread-a',
      getState: () => ({
        canMarkRead: true,
        viewingLatest: true,
        hasUnreadIncoming: true,
      }),
      markRead: (conversationId) => marked.push(conversationId),
    })

    expect(marked).toEqual([])
    expect(
      shouldMarkConversationRead({
        canMarkRead: true,
        viewingLatest: true,
        hasUnreadIncoming: true,
        documentVisible: target.visibilityState === 'visible',
      })
    ).toBe(false)
  })

  it('stays unread when the document returns while older history is in view', () => {
    const marked: string[] = []
    const target = new FakeVisibilityDocument()
    bindConversationReadOnVisibility({
      target,
      conversationId: 'thread-a',
      getState: () => ({
        canMarkRead: true,
        viewingLatest: false,
        hasUnreadIncoming: true,
      }),
      markRead: (conversationId) => marked.push(conversationId),
    })

    target.become('visible')
    expect(marked).toEqual([])
  })

  it('marks eligible messages when the document returns at the latest message', () => {
    const marked: string[] = []
    const target = new FakeVisibilityDocument()
    bindConversationReadOnVisibility({
      target,
      conversationId: 'thread-a',
      getState: () => ({
        canMarkRead: true,
        viewingLatest: true,
        hasUnreadIncoming: true,
      }),
      markRead: (conversationId) => marked.push(conversationId),
    })

    target.become('visible')
    expect(marked).toEqual(['thread-a'])
  })

  it('ignores visibility events after the conversation unmounts or switches', () => {
    const marked: string[] = []
    const target = new FakeVisibilityDocument()
    const detach = bindConversationReadOnVisibility({
      target,
      conversationId: 'thread-a',
      getState: () => ({
        canMarkRead: true,
        viewingLatest: true,
        hasUnreadIncoming: true,
      }),
      markRead: (conversationId) => marked.push(conversationId),
    })
    detach()
    target.become('visible')

    const detachNext = bindConversationReadOnVisibility({
      target,
      conversationId: 'thread-b',
      getState: () => ({
        canMarkRead: true,
        viewingLatest: true,
        hasUnreadIncoming: true,
      }),
      markRead: (conversationId) => marked.push(conversationId),
    })
    target.become('visible')
    detachNext()
    target.become('hidden')
    target.become('visible')

    expect(marked).toEqual(['thread-b'])
  })
})
