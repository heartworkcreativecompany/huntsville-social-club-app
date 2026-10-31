import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  directoryBackHref,
  isAllowedDirectoryHref,
  memberProfileHref,
} from '@/lib/directory-return'
import { DEFAULT_DIRECTORY_BROWSE_STATE } from '@/lib/members-discovery'

const filtered = {
  search: 'Ada',
  browse: {
    browseMode: 'industry' as const,
    intentFilter: 'all' as const,
    industryFilter: 'aerospace_aviation_space',
  },
  page: 3,
}

describe('directory return URLs', () => {
  it('keeps page, search, browse, and industry on the profile link', () => {
    expect(memberProfileHref('member_abc', filtered)).toBe(
      '/members/member_abc?q=Ada&browse=industry&industry=aerospace_aviation_space&page=3'
    )
  })

  it('omits default directory state from the profile link', () => {
    expect(
      memberProfileHref('member_abc', {
        search: '',
        browse: DEFAULT_DIRECTORY_BROWSE_STATE,
        page: 1,
      })
    ).toBe('/members/member_abc')
  })

  it('rebuilds the directory link from known fields and ignores a raw return URL', () => {
    expect(
      directoryBackHref({
        q: 'Ada',
        browse: 'industry',
        industry: 'aerospace_aviation_space',
        page: '3',
        from: 'https://evil.example/phish',
        next: '//evil.example',
        redirect: '/admin',
      })
    ).toBe(
      '/members?q=Ada&browse=industry&industry=aerospace_aviation_space&page=3'
    )
  })

  it('falls back to the directory root when a profile has no directory query', () => {
    expect(directoryBackHref({})).toBe('/members')
    expect(
      directoryBackHref({
        from: 'https://evil.example',
        browse: 'javascript:alert(1)',
        page: '-4',
      })
    ).toBe('/members')
  })

  it('rejects external and protocol-relative directory hrefs', () => {
    expect(isAllowedDirectoryHref('/members?page=2')).toBe(true)
    expect(isAllowedDirectoryHref('/members')).toBe(true)
    expect(isAllowedDirectoryHref('//evil.example')).toBe(false)
    expect(isAllowedDirectoryHref('https://evil.example')).toBe(false)
    expect(isAllowedDirectoryHref('/members/member_abc')).toBe(false)
  })

  it('uses the validated directory href for every profile back link', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(club)/members/[id]/page.tsx'),
      'utf8'
    )
    expect(source).toContain('directoryBackHref')
    expect(source).not.toContain('href="/members"')
  })
})
