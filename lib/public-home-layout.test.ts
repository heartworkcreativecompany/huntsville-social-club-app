import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('public homepage layout scale', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/marketing/public-home-content.tsx'),
    'utf8'
  )

  it('puts the three membership cards on one row from the desktop breakpoint', () => {
    expect(source).toContain(
      'aria-labelledby="membership-value-heading"'
    )
    expect(source).toContain('mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3')
  })

  it('steps the hero type instead of applying text-7xl from the tablet breakpoint', () => {
    expect(source).toContain('lg:text-6xl xl:text-7xl')
    expect(source).toContain('[@media(max-height:820px)]:xl:text-6xl')
    expect(source).not.toContain('md:text-7xl')
  })
})
