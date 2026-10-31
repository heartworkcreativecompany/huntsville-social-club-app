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

  it('enlarges the desktop hero without jumping to text-7xl on tablet', () => {
    expect(source).toContain('text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl lg:text-7xl xl:text-[5.25rem]')
    expect(source).toContain('lg:max-w-3xl lg:text-xl xl:mt-4 xl:text-2xl xl:leading-snug')
    expect(source).not.toContain('md:text-7xl')
    expect(source).not.toContain('[@media(max-height:820px)]:xl:text-6xl')
    expect(source).toContain('relative z-10 flex flex-col md:min-h-[92svh]')
    expect(source).toContain('px-5 pt-8 pb-14')
    expect(source).toContain('md:flex-1 md:justify-end')
    expect(source).not.toContain('min-h-[100svh] flex-col')
  })
})
