import { describe, expect, it } from 'vitest'
import {
  ageOnCalendarDate,
  evaluateMembershipAgeEligibility,
  parseIsoDateOnly,
} from '@/lib/application-age-eligibility'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function localDate(
  year: number,
  month: number,
  day: number,
  hour = 12
): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0)
}

describe('parseIsoDateOnly', () => {
  it('parses the stored YYYY-MM-DD calendar date without using timestamps', () => {
    expect(parseIsoDateOnly('2000-01-02')).toEqual({
      year: 2000,
      month: 1,
      day: 2,
    })
    expect(parseIsoDateOnly(' 2008-03-09 ')).toEqual({
      year: 2008,
      month: 3,
      day: 9,
    })
  })

  it('rejects invalid and non-normalized dates', () => {
    expect(parseIsoDateOnly('')).toBeNull()
    expect(parseIsoDateOnly('2008-3-9')).toBeNull()
    expect(parseIsoDateOnly('03/09/2008')).toBeNull()
    expect(parseIsoDateOnly('2008-13-01')).toBeNull()
    expect(parseIsoDateOnly('2026-02-30')).toBeNull()
    expect(parseIsoDateOnly('2023-02-29')).toBeNull()
    expect(parseIsoDateOnly('2008-03-09T00:00:00Z')).toBeNull()
  })

  it('accepts leap-day calendar dates', () => {
    expect(parseIsoDateOnly('2008-02-29')).toEqual({
      year: 2008,
      month: 2,
      day: 29,
    })
  })
})

describe('evaluateMembershipAgeEligibility', () => {
  it('accepts a person who turns 18 today', () => {
    expect(
      evaluateMembershipAgeEligibility(
        '2008-09-09',
        localDate(2026, 9, 9, 0)
      )
    ).toEqual({ ok: true, age: 18 })
    expect(
      evaluateMembershipAgeEligibility(
        '2008-09-09',
        localDate(2026, 9, 9, 23)
      )
    ).toEqual({ ok: true, age: 18 })
  })

  it('rejects a person who turns 18 tomorrow', () => {
    expect(
      evaluateMembershipAgeEligibility(
        '2008-09-10',
        localDate(2026, 9, 9, 23)
      )
    ).toEqual({ ok: false, code: 'underage' })
  })

  it('rejects a person under 18', () => {
    expect(
      evaluateMembershipAgeEligibility(
        '2010-09-09',
        localDate(2026, 9, 9)
      )
    ).toEqual({ ok: false, code: 'underage' })
  })

  it('rejects invalid and future dates', () => {
    expect(evaluateMembershipAgeEligibility('not-a-date')).toEqual({
      ok: false,
      code: 'invalid',
    })
    expect(
      evaluateMembershipAgeEligibility('2026-02-30', localDate(2026, 9, 9))
    ).toEqual({ ok: false, code: 'invalid' })
    expect(
      evaluateMembershipAgeEligibility('2027-01-01', localDate(2026, 9, 9))
    ).toEqual({ ok: false, code: 'future' })
    expect(evaluateMembershipAgeEligibility('')).toEqual({
      ok: false,
      code: 'missing',
    })
    expect(evaluateMembershipAgeEligibility('   ')).toEqual({
      ok: false,
      code: 'missing',
    })
  })

  it('keeps calendar-date age stable around local timezone boundaries', () => {
    const dob = '2008-09-09'
    expect(
      evaluateMembershipAgeEligibility(dob, localDate(2026, 9, 8, 23))
    ).toEqual({ ok: false, code: 'underage' })
    expect(
      evaluateMembershipAgeEligibility(dob, localDate(2026, 9, 9, 0))
    ).toEqual({ ok: true, age: 18 })
    expect(
      evaluateMembershipAgeEligibility(dob, localDate(2026, 9, 9, 23))
    ).toEqual({ ok: true, age: 18 })
  })

  it('treats a leap-day birthday as occurring on March 1 in non-leap years', () => {
    expect(
      ageOnCalendarDate(
        { year: 2008, month: 2, day: 29 },
        { year: 2026, month: 2, day: 28 }
      )
    ).toBe(17)
    expect(
      evaluateMembershipAgeEligibility(
        '2008-02-29',
        localDate(2026, 2, 28)
      )
    ).toEqual({ ok: false, code: 'underage' })
    expect(
      evaluateMembershipAgeEligibility(
        '2008-02-29',
        localDate(2026, 3, 1)
      )
    ).toEqual({ ok: true, age: 18 })
  })

  it('does not put the date of birth into source-level logging', () => {
    const source = readFileSync(
      join(__dirname, 'application-age-eligibility.ts'),
      'utf8'
    )
    expect(source).not.toMatch(/console\.(log|info|warn|error|debug)/)
    expect(source).not.toContain('Date.parse')
    expect(source).not.toMatch(/new Date\(\s*dateOfBirth/)
    expect(source).not.toMatch(/new Date\(\s*trimmed/)
  })
})
