import { describe, expect, it } from 'vitest'
import {
  loadUpcomingEventsPreview,
  selectUpcomingEventPreviews,
  UPCOMING_EVENTS_PREVIEW_LIMIT,
  type UpcomingEventSourceRow,
} from '@/lib/load-upcoming-events'

const MEMBER_ID = 'member-1'
const OTHER_ID = 'member-2'

function futureIso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString()
}

function pastIso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
}

function row(
  patch: Partial<UpcomingEventSourceRow> & Pick<UpcomingEventSourceRow, 'id'>
): UpcomingEventSourceRow {
  return {
    owner_id: OTHER_ID,
    title: patch.title ?? patch.id,
    location: 'Huntsville',
    starts_at: futureIso(2),
    status: 'published',
    event_type: 'standard_event',
    ...patch,
  }
}

describe('loadUpcomingEventsPreview', () => {
  it('reads events only and does not query attendees or creator profiles', async () => {
    const tables: string[] = []
    const supabase = {
      from(table: string) {
        tables.push(table)
        return {
          select() {
            return {
              gte() {
                return {
                  async order() {
                    return { data: [], error: null }
                  },
                }
              },
            }
          },
        }
      },
    }

    const result = await loadUpcomingEventsPreview(
      supabase as never,
      { userId: MEMBER_ID, role: 'member' }
    )

    expect(tables).toEqual(['events'])
    expect(result).toEqual({ events: [], error: null })
  })
})

describe('selectUpcomingEventPreviews', () => {
  it('returns up to three chronological upcoming published events', () => {
    const selected = selectUpcomingEventPreviews(
      [
        row({ id: 'later', starts_at: futureIso(9) }),
        row({ id: 'soon', starts_at: futureIso(1) }),
        row({ id: 'mid', starts_at: futureIso(4) }),
        row({ id: 'last', starts_at: futureIso(12) }),
      ],
      { userId: MEMBER_ID, role: 'member' }
    )

    expect(UPCOMING_EVENTS_PREVIEW_LIMIT).toBe(3)
    expect(selected.map((event) => event.id)).toEqual(['soon', 'mid', 'later'])
    expect(selected[0]).toEqual({
      id: 'soon',
      title: 'soon',
      location: 'Huntsville',
      starts_at: expect.any(String),
      event_type: 'standard_event',
      status: 'published',
    })
  })

  it('omits past and cancelled events and does not include attendee or creator fields', () => {
    const selected = selectUpcomingEventPreviews(
      [
        row({ id: 'past', starts_at: pastIso(1) }),
        row({ id: 'cancelled', status: 'cancelled', starts_at: futureIso(2) }),
        row({ id: 'ok', starts_at: futureIso(3) }),
      ],
      { userId: MEMBER_ID, role: 'member' }
    )

    expect(selected.map((event) => event.id)).toEqual(['ok'])
    expect(JSON.stringify(selected)).not.toMatch(/owner|attendee|full_name|creator/i)
    expect(selected[0]).not.toHaveProperty('owner_id')
  })

  it('hides unpublished events from other members but allows the owner and admins', () => {
    const draft = row({
      id: 'draft',
      owner_id: MEMBER_ID,
      status: 'draft',
      starts_at: futureIso(2),
    })
    const hidden = row({
      id: 'someone-else-draft',
      owner_id: OTHER_ID,
      status: 'draft',
      starts_at: futureIso(1),
    })

    expect(
      selectUpcomingEventPreviews([draft, hidden], {
        userId: MEMBER_ID,
        role: 'member',
      }).map((event) => event.id)
    ).toEqual(['draft'])

    expect(
      selectUpcomingEventPreviews([hidden], {
        userId: MEMBER_ID,
        role: 'admin',
      }).map((event) => event.id)
    ).toEqual(['someone-else-draft'])
  })
})
