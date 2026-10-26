import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')

function source(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('conversation scrolling', () => {
  it('scrolls the message list itself and keeps chronological order', () => {
    const thread = source('components/messages/message-thread.tsx')
    const messages = source('lib/member-messages.ts')
    const page = source('app/(club)/messages/[conversationId]/page.tsx')

    expect(thread).toContain('data-message-scroll')
    expect(thread).not.toContain('scrollIntoView')
    expect(thread).toContain('planConversationScroll')
    expect(thread).toContain('overscroll-contain')
    expect(thread).toContain("'(prefers-reduced-motion: reduce)'")
    expect(thread).toContain('markVisibleConversationRead')
    expect(thread).toContain('shouldMarkConversationRead')
    expect(messages).toContain(".order('created_at', { ascending: true })")
    expect(page).toContain('key={thread.conversationId}')
    expect(page).toContain('canMarkRead={Boolean(entitlements?.canMessage)}')
    expect(page).not.toContain('markConversationMessagesRead')
    expect(page).toContain('adminModeration: viewer.role === \'admin\'')
  })

  it('marks a conversation read only through the paid messaging gate', () => {
    const actions = source('app/(club)/messages/actions.ts')
    expect(actions).toContain('export async function markVisibleConversationRead')
    expect(actions).toContain('if (!entitlements?.canMessage)')
    expect(actions).toContain('markConversationMessagesRead')
  })
})

describe('persistent club header', () => {
  it('keeps the site header outside the page scroller and gives the menu its own scroll', () => {
    const shell = source('components/shell/club-shell.tsx')
    const layout = source('app/layout.tsx')
    const headerIndex = shell.indexOf('<ClubNav')
    const scrollIndex = shell.indexOf('data-club-content-scroll')

    expect(headerIndex).toBeGreaterThan(-1)
    expect(scrollIndex).toBeGreaterThan(headerIndex)
    expect(shell).toContain('overflow-y-auto')
    expect(shell).not.toContain('scrollIntoView')
    expect(layout).toContain('overflow-x-clip')
    expect(layout).not.toMatch(/<(?:html|body)[^>]*overflow-hidden/)
  })
})
