'use client'

import {
  chipActiveClassName,
  chipInactiveClassName,
} from '@/lib/event-labels'
import type { IntentFilterValue } from '@/lib/members-discovery'

const PILLS: { value: IntentFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'networking', label: 'Networking' },
  { value: 'dating', label: 'Dating' },
  { value: 'friends', label: 'Friends' },
]

export default function MemberIntentFilterPills({
  value,
  onChange,
}: {
  value: IntentFilterValue
  onChange: (value: IntentFilterValue) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PILLS.map((pill) => {
        const active = value === pill.value
        return (
          <button
            key={pill.value}
            type="button"
            onClick={() => onChange(pill.value)}
            className={active ? chipActiveClassName : chipInactiveClassName}
          >
            {pill.label}
          </button>
        )
      })}
    </div>
  )
}
