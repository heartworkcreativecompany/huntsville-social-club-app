'use client'

import { useId } from 'react'
import {
  chipOptionsWithLegacySelected,
  toggleChipSelection,
} from '@/lib/chip-selection'
import { chipActiveClassName, chipInactiveClassName } from '@/lib/event-labels'

export default function ChipMultiSelect({
  options,
  selected,
  onChange,
  min,
  max,
  hint,
  ariaLabel,
}: {
  options: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
  min?: number
  max?: number
  hint?: string
  ariaLabel?: string
}) {
  const hintId = useId()
  const visibleOptions = chipOptionsWithLegacySelected(options, selected)
  const rangeHint =
    hint ??
    (min !== undefined && max !== undefined
      ? `Select ${min}–${max} options`
      : min !== undefined
        ? `Select at least ${min}`
        : max !== undefined
          ? `Select up to ${max}`
          : null)
  const showStatus = rangeHint != null
  const statusText = showStatus
    ? [rangeHint, selected.length > 0 ? `${selected.length} selected` : null]
        .filter(Boolean)
        .join(' · ')
    : null

  const toggle = (option: string) => {
    onChange(toggleChipSelection(selected, option, max))
  }

  return (
    <div
      className="grid gap-2"
      role="group"
      aria-label={ariaLabel}
      aria-describedby={statusText ? hintId : undefined}
    >
      {statusText ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {statusText}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {visibleOptions.map((option) => {
          const active = selected.includes(option)
          const atMax =
            max !== undefined && !active && selected.length >= max
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={active}
              disabled={atMax}
              className={active ? chipActiveClassName : chipInactiveClassName}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
