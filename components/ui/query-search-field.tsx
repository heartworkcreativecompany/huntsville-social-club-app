'use client'

import { useEffect, useRef, useState } from 'react'
import { inputClassName } from '@/lib/event-labels'

export const QUERY_SEARCH_DEBOUNCE_MS = 300

type QuerySearchFieldProps = {
  label: string
  placeholder: string
  committedValue: string
  onCommit: (value: string) => void
  onValueChange?: (value: string) => void
  isPending?: boolean
  pendingLabel?: string
}

export default function QuerySearchField({
  label,
  placeholder,
  committedValue,
  onCommit,
  onValueChange,
  isPending = false,
  pendingLabel = 'Loading…',
}: QuerySearchFieldProps) {
  const [draft, setDraft] = useState(committedValue)
  const draftRef = useRef(draft)
  const lastCommitted = useRef(committedValue.trim())
  const onCommitRef = useRef(onCommit)
  const onValueChangeRef = useRef(onValueChange)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    draftRef.current = draft
    onCommitRef.current = onCommit
    onValueChangeRef.current = onValueChange
  })

  useEffect(() => {
    const inputFocused =
      typeof document !== 'undefined' &&
      document.activeElement === inputRef.current
    if (
      inputFocused &&
      draftRef.current.trim() !== committedValue.trim()
    ) {
      return
    }
    setDraft(committedValue)
    draftRef.current = committedValue
    lastCommitted.current = committedValue.trim()
  }, [committedValue])

  useEffect(() => {
    const next = draft.trim()
    if (next === lastCommitted.current) return
    const timer = window.setTimeout(() => {
      lastCommitted.current = next
      onCommitRef.current(next)
    }, QUERY_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft])

  function updateDraft(value: string) {
    draftRef.current = value
    setDraft(value)
    onValueChangeRef.current?.(value)
  }

  function commitNow(value: string) {
    const next = value.trim()
    lastCommitted.current = next
    onCommitRef.current(next)
  }

  return (
    <form
      role="search"
      className="grid min-w-0 gap-1.5 text-sm"
      onSubmit={(event) => {
        event.preventDefault()
        commitNow(draft)
      }}
    >
      <label className="grid min-w-0 gap-1.5">
        <span className="font-medium text-foreground">{label}</span>
        <span className="relative block min-w-0">
          <input
            ref={inputRef}
            type="search"
            value={draft}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(event) => updateDraft(event.target.value)}
            className={`${inputClassName} [&::-webkit-search-cancel-button]:appearance-none ${draft ? 'pr-20' : ''}`}
          />
          {draft ? (
            <button
              type="button"
              className="absolute top-1/2 right-2 inline-flex min-h-8 -translate-y-1/2 items-center rounded-full px-2.5 font-brand text-xs font-medium text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-label="Clear search"
              onClick={() => {
                updateDraft('')
                commitNow('')
              }}
            >
              Clear
            </button>
          ) : null}
        </span>
      </label>
      {isPending ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {pendingLabel}
        </p>
      ) : null}
    </form>
  )
}
