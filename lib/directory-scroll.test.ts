import { describe, expect, it } from 'vitest'
import {
  clearDirectoryScrollMark,
  directoryScrollMarkForHref,
  parseDirectoryScrollMark,
  writeDirectoryScrollMark,
} from '@/lib/directory-scroll'

describe('directory scroll marks', () => {
  it('restores only a mark for the current directory URL', () => {
    const raw = JSON.stringify({
      href: '/members?q=Ada&page=2',
      cardId: 'member_abc',
      scrollTop: 640,
    })

    expect(directoryScrollMarkForHref(raw, '/members?q=Ada&page=2')).toEqual({
      href: '/members?q=Ada&page=2',
      cardId: 'member_abc',
      scrollTop: 640,
    })
    expect(directoryScrollMarkForHref(raw, '/members?page=3')).toBeNull()
    expect(directoryScrollMarkForHref(raw, '/members?q=Ada&page=3')).toBeNull()
    expect(
      directoryScrollMarkForHref(raw, '/directory-layout-review?q=Ada&page=2')
    ).toBeNull()
  })

  it('does not let a review-page mark reposition the member directory', () => {
    const raw = JSON.stringify({
      href: '/directory-layout-review?page=2',
      cardId: 'fixture-ada',
      scrollTop: 800,
    })
    expect(
      directoryScrollMarkForHref(raw, '/directory-layout-review?page=2')?.cardId
    ).toBe('fixture-ada')
    expect(directoryScrollMarkForHref(raw, '/members?page=2')).toBeNull()
  })

  it('keeps navigation usable when storage throws', () => {
    const storage = {
      setItem() {
        throw new Error('blocked')
      },
      removeItem() {
        throw new Error('blocked')
      },
      getItem() {
        throw new Error('blocked')
      },
    }
    expect(
      writeDirectoryScrollMark(storage, {
        href: '/members?page=2',
        cardId: 'member_abc',
        scrollTop: 20,
      })
    ).toBe(false)
    expect(() => clearDirectoryScrollMark(storage)).not.toThrow()
  })

  it('rejects marks that could point at another origin', () => {
    expect(
      parseDirectoryScrollMark(
        JSON.stringify({
          href: 'https://evil.example/members',
          cardId: 'member_abc',
          scrollTop: 10,
        })
      )
    ).toBeNull()
    expect(
      parseDirectoryScrollMark(
        JSON.stringify({
          href: '//evil.example',
          cardId: 'member_abc',
          scrollTop: 10,
        })
      )
    ).toBeNull()
    expect(parseDirectoryScrollMark('not-json')).toBeNull()
  })
})
