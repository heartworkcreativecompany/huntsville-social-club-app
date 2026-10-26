export const MESSAGE_LIST_BOTTOM_THRESHOLD_PX = 64

export type MessageScrollItem = {
  id: string
  isOwn: boolean
}

export type MessageScrollSnapshot = {
  firstId: string | null
  lastId: string | null
  scrollHeight: number
  scrollTop: number
  stuckToBottom: boolean
}

export type MessageScrollAction =
  | { type: 'pin'; behavior: 'auto' }
  | { type: 'preserve-prepend'; scrollTop: number }
  | { type: 'hold' }

export type MessageScrollPlan = {
  action: MessageScrollAction
  unseenIncoming: number
  stuckToBottom: boolean
}

export function isNearMessageBottom(
  metrics: {
    scrollHeight: number
    scrollTop: number
    clientHeight: number
  },
  threshold = MESSAGE_LIST_BOTTOM_THRESHOLD_PX
): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
  )
}

export function isHistoryPrepend(
  previousFirstId: string | null,
  messageIds: string[]
): boolean {
  if (!previousFirstId) return false
  return messageIds.indexOf(previousFirstId) > 0
}

export function incomingCountAfter(
  messages: MessageScrollItem[],
  previousLastId: string | null
): number {
  if (!previousLastId) return 0
  const index = messages.findIndex((message) => message.id === previousLastId)
  const tail = index === -1 ? messages : messages.slice(index + 1)
  return tail.filter((message) => !message.isOwn).length
}

/**
 * Decide how the message scroller should move after a render.
 * Initial placement and follow-along updates are instant. Prepending older
 * history keeps the current pixels in view. Reading history does not jump.
 */
export function planConversationScroll(input: {
  previous: MessageScrollSnapshot | null
  messages: MessageScrollItem[]
  scrollHeight: number
  forceReveal: boolean
}): MessageScrollPlan {
  const ids = input.messages.map((message) => message.id)
  const lastId = ids[ids.length - 1] ?? null

  if (!input.previous || input.forceReveal) {
    return {
      action: { type: 'pin', behavior: 'auto' },
      unseenIncoming: 0,
      stuckToBottom: true,
    }
  }

  const prepended = isHistoryPrepend(input.previous.firstId, ids)
  const tailChanged = lastId !== input.previous.lastId
  const unseen = tailChanged
    ? incomingCountAfter(input.messages, input.previous.lastId)
    : 0

  if (input.previous.stuckToBottom && (prepended || tailChanged)) {
    return {
      action: { type: 'pin', behavior: 'auto' },
      unseenIncoming: 0,
      stuckToBottom: true,
    }
  }

  if (prepended) {
    return {
      action: {
        type: 'preserve-prepend',
        scrollTop:
          input.previous.scrollTop +
          (input.scrollHeight - input.previous.scrollHeight),
      },
      unseenIncoming: unseen,
      stuckToBottom: false,
    }
  }

  if (tailChanged) {
    return {
      action: { type: 'hold' },
      unseenIncoming: unseen,
      stuckToBottom: false,
    }
  }

  return {
    action: { type: 'hold' },
    unseenIncoming: 0,
    stuckToBottom: input.previous.stuckToBottom,
  }
}

export function scrollBehaviorForJump(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth'
}

export function latestJumpLabel(unseenIncoming: number): string {
  return unseenIncoming > 0 ? 'New messages ↓' : 'Jump to latest'
}

export function shouldMarkConversationRead(input: {
  canMarkRead: boolean
  viewingLatest: boolean
  hasUnreadIncoming: boolean
}): boolean {
  return input.canMarkRead && input.viewingLatest && input.hasUnreadIncoming
}
