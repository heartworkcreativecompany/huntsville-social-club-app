'use client'

import {
  chipActiveClassName,
  chipInactiveClassName,
} from '@/lib/event-labels'
import {
  DIRECTORY_INTENT_FILTER_OPTIONS,
  type DirectoryIntentFilterValue,
} from '@/lib/members-discovery'

export const DIRECTORY_INTENT_PILLS_CLASS = 'flex min-w-0 flex-wrap gap-2'

const PILL_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export default function MemberIntentFilterPills({
  value,
  onChange,
}: {
  value: DirectoryIntentFilterValue
  onChange: (value: DirectoryIntentFilterValue) => void
}) {
  return (
    <div
      className={DIRECTORY_INTENT_PILLS_CLASS}
      role="group"
      aria-label="Filter by intention"
    >
      {DIRECTORY_INTENT_FILTER_OPTIONS.map((pill) => {
        const active = value === pill.value
        return (
          <button
            key={pill.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(pill.value)}
            className={`${active ? chipActiveClassName : chipInactiveClassName} ${PILL_FOCUS_CLASS}`}
          >
            {pill.label}
          </button>
        )
      })}
    </div>
  )
}
