import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { directoryLayoutReviewEnabled } from '@/lib/directory-layout-review'

describe('directory layout review gate', () => {
  it('stays closed in production even when the review flag is set', () => {
    expect(
      directoryLayoutReviewEnabled({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        DIRECTORY_LAYOUT_REVIEW: '1',
      })
    ).toBe(false)
    expect(
      directoryLayoutReviewEnabled({
        NODE_ENV: 'production',
        DIRECTORY_LAYOUT_REVIEW: '1',
      })
    ).toBe(false)
    expect(
      directoryLayoutReviewEnabled({
        NODE_ENV: 'development',
        VERCEL_ENV: 'production',
        DIRECTORY_LAYOUT_REVIEW: '1',
      })
    ).toBe(false)
  })

  it('opens only for a non-production process with the flag', () => {
    expect(
      directoryLayoutReviewEnabled({
        NODE_ENV: 'development',
        DIRECTORY_LAYOUT_REVIEW: '1',
      })
    ).toBe(true)
    expect(
      directoryLayoutReviewEnabled({
        NODE_ENV: 'development',
        DIRECTORY_LAYOUT_REVIEW: '0',
      })
    ).toBe(false)
    expect(
      directoryLayoutReviewEnabled({
        NODE_ENV: 'test',
      })
    ).toBe(false)
  })

  it('gates both review routes through the production check', () => {
    for (const file of [
      'app/directory-layout-review/page.tsx',
      'app/directory-layout-review/[id]/page.tsx',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source).toContain('directoryLayoutReviewEnabled')
      expect(source).toContain('notFound()')
    }
  })
})
