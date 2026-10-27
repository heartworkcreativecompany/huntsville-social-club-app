import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PublicEventTickets from '@/components/marketing/public-event-tickets'
import { publicContentScrollTop } from '@/lib/public-content-scroll'

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_HREF = 'https://members.huntsvillesocialclub.com/events/11111111-1111-4111-8111-111111111111'

function tickets(offer: Parameters<typeof PublicEventTickets>[0]['offer']) {
  return renderToStaticMarkup(
    createElement(PublicEventTickets, {
      eventId: EVENT_ID,
      memberHref: MEMBER_HREF,
      offer,
      rsvpQuestion: 'How did you hear about this?',
      rsvpQuestionRequired: true,
    })
  )
}

describe('public event ticket actions', () => {
  it('offers Get Tickets and Buy a Ticket only while guest purchase is open', () => {
    const html = tickets({
      kind: 'open',
      priceLabel: '$15',
      spotsLeft: 4,
    })

    expect(html).toContain('Get Tickets')
    expect(html).toContain('Buy a Ticket')
    expect(html).toContain('Members: sign in to RSVP')
    expect(html).toContain(MEMBER_HREF)
    expect(html).toContain('See All Events')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('href="/events"')
    expect(html).toContain('Only 4 spots left.')
    expect(html).not.toContain('Apply for membership')
    expect(html).not.toContain('RSVP as a guest')
    expect(html).not.toContain('type="submit"')
  })

  it('keeps sold-out and closed events off the purchase actions', () => {
    for (const offer of [
      { kind: 'sold_out' as const },
      { kind: 'hidden' as const },
    ]) {
      const html = tickets(offer)
      expect(html).toContain('Members: sign in to RSVP')
      expect(html).toContain('See All Events')
      expect(html).not.toContain('Get Tickets')
      expect(html).not.toContain('Buy a Ticket')
      expect(html).not.toContain('Apply for membership')
    }

    expect(tickets({ kind: 'sold_out' })).toContain('Sold out')
    expect(tickets({ kind: 'hidden' })).not.toContain('Sold out')
  })
})

describe('public content scroll offset', () => {
  it('places the destination below the scroller edge', () => {
    expect(publicContentScrollTop(400, 200, 80)).toBe(504)
    expect(publicContentScrollTop(0, 10, 80)).toBe(0)
  })
})
