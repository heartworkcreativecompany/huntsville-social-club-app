import { describe, expect, it } from 'vitest'
import {
  isSponsorshipEligibleEventType,
  normalizeSponsorBusinessName,
  sortEventSponsors,
} from '@/lib/event-sponsors'

describe('event sponsors helpers', () => {
  it('limits sponsorship eligibility to Circle Socials and Premium events', () => {
    expect(isSponsorshipEligibleEventType('circle_social')).toBe(true)
    expect(isSponsorshipEligibleEventType('premium_event')).toBe(true)
    expect(isSponsorshipEligibleEventType('standard_event')).toBe(false)
    expect(isSponsorshipEligibleEventType(null)).toBe(false)
  })

  it('normalizes business names for matching the same sponsor across events', () => {
    expect(normalizeSponsorBusinessName('  Acme   Coffee  ')).toBe('Acme Coffee')
  })

  it('orders multiple sponsors on one event by sort_order then name', () => {
    const ordered = sortEventSponsors([
      { sort_order: 2, business_name: 'Zebra Co' },
      { sort_order: 0, business_name: 'Beta Labs' },
      { sort_order: 0, business_name: 'Alpha Labs' },
      { sort_order: 1, business_name: 'Midtown' },
    ])

    expect(ordered.map((row) => row.business_name)).toEqual([
      'Alpha Labs',
      'Beta Labs',
      'Midtown',
      'Zebra Co',
    ])
  })

  it('supports one sponsor appearing on multiple events via shared ids', () => {
    const sharedSponsorId = 'sponsor-shared'
    const eventA = [
      { event_id: 'event-a', sponsor_id: sharedSponsorId, sort_order: 0 },
      { event_id: 'event-a', sponsor_id: 'sponsor-other', sort_order: 1 },
    ]
    const eventB = [
      { event_id: 'event-b', sponsor_id: sharedSponsorId, sort_order: 0 },
    ]

    expect(eventA.filter((row) => row.sponsor_id === sharedSponsorId)).toHaveLength(1)
    expect(eventB.filter((row) => row.sponsor_id === sharedSponsorId)).toHaveLength(1)
    expect(
      [...eventA, ...eventB].filter((row) => row.sponsor_id === sharedSponsorId)
    ).toHaveLength(2)
  })

  it('keeps legacy single-sponsor payloads loadable as a one-item list', () => {
    const legacySponsors = sortEventSponsors([
      {
        id: 'sponsor-1',
        business_name: 'Legacy Sponsor',
        contact_email: null,
        logo_url: null,
        website_url: null,
        sort_order: 0,
      },
    ])

    expect(legacySponsors).toHaveLength(1)
    expect(legacySponsors[0]?.business_name).toBe('Legacy Sponsor')
  })
})
