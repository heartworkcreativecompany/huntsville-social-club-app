'use client'

import { EVENT_LIST_FILTERS, type EventListFilter } from '@/lib/event-display'
import { chipActiveClassName, chipInactiveClassName } from '@/lib/event-labels'

export default function EventFilterTabs({
  active,
  onChange,
  counts,
}: {
  active: EventListFilter
  onChange: (filter: EventListFilter) => void
  counts?: Partial<Record<EventListFilter, number>>
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label="Filter events"
    >
      {EVENT_LIST_FILTERS.map((tab) => {
        const isActive = active === tab.id
        const count = counts?.[tab.id]

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={isActive ? chipActiveClassName : chipInactiveClassName}
          >
            {tab.label}
            {count != null && count > 0 ? (
              <span className="ml-1.5 opacity-80">({count})</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
