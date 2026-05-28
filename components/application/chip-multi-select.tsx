'use client'

export default function ChipMultiSelect({
  options,
  selected,
  onChange,
  min,
  max,
}: {
  options: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
  min?: number
  max?: number
}) {
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option))
      return
    }
    if (max !== undefined && selected.length >= max) return
    onChange([...selected, option])
  }

  return (
    <div className="grid gap-2">
      {min !== undefined || max !== undefined ? (
        <p className="text-xs text-muted-foreground">
          {min !== undefined && max !== undefined
            ? `Select ${min}–${max} options`
            : min !== undefined
              ? `Select at least ${min}`
              : `Select up to ${max}`}
          {selected.length > 0 ? ` · ${selected.length} selected` : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-accent-soft text-muted-foreground hover:text-foreground'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
