import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChipMultiSelect from '@/components/application/chip-multi-select'
import { EVENT_TAG_OPTIONS } from '@/lib/event-tags'
import { EVENT_LIST_FILTERS } from '@/lib/event-display'

const repoRoot = join(__dirname, '..')

describe('event descriptor tags', () => {
  it('defines the three approved tags with exact spelling', () => {
    expect(EVENT_TAG_OPTIONS).toEqual([
      'Family-friendly events',
      'Cultural outings',
      'Members-only gatherings',
    ])
    expect(EVENT_TAG_OPTIONS[1]).toBe('Cultural outings')
    expect(EVENT_TAG_OPTIONS).not.toContain('Cultural outtings')
  })

  it('renders the three tags as optional chips', () => {
    const html = renderToStaticMarkup(
      createElement(ChipMultiSelect, {
        options: EVENT_TAG_OPTIONS,
        selected: [],
        onChange: () => undefined,
        ariaLabel: 'Event tags',
      })
    )

    expect(html).toContain('Family-friendly events')
    expect(html).toContain('Cultural outings')
    expect(html).toContain('Members-only gatherings')
    expect(html).not.toContain('Choose 3–6 interests')
    expect(html).not.toContain('Select at least')
    expect(html.match(/aria-pressed="true"/g)).toBeNull()
  })

  it('does not turn Members-only gatherings into an event access type or list filter', () => {
    const actions = readFileSync(
      join(repoRoot, 'app/(club)/events/actions.ts'),
      'utf8'
    )
    const eventForm = readFileSync(
      join(repoRoot, 'app/(club)/events/event-form.tsx'),
      'utf8'
    )
    const eventEditForm = readFileSync(
      join(repoRoot, 'app/(club)/events/event-edit-form.tsx'),
      'utf8'
    )

    expect(actions).toContain("'standard_event'")
    expect(actions).toContain("'circle_social'")
    expect(actions).toContain("'premium_event'")
    expect(actions).not.toContain('Members-only gatherings')
    expect(actions).not.toContain('EVENT_TAG_OPTIONS')
    expect(actions).not.toMatch(/tags:/)

    expect(EVENT_LIST_FILTERS.map((filter) => filter.id)).toEqual([
      'upcoming',
      'circle_social',
      'premium_event',
      'past',
      'rsvpd',
    ])
    expect(EVENT_LIST_FILTERS.some((filter) => filter.label === 'Members-only gatherings')).toBe(
      false
    )

    expect(eventForm).toContain('eventType')
    expect(eventForm).not.toContain('EVENT_TAG_OPTIONS')
    expect(eventEditForm).not.toContain('EVENT_TAG_OPTIONS')
  })
})
