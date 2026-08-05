'use client'

import { useMemo, useState } from 'react'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'
import type { SponsorOption } from '@/lib/event-sponsors'
import { isSponsorshipEligibleEventType } from '@/lib/event-sponsors'

type EventSponsorsFieldProps = {
  eventType: string
  availableSponsors: SponsorOption[]
  selectedSponsorIds: string[]
  onChange: (sponsorIds: string[]) => void
  onCreateSponsor?: (businessName: string) => Promise<
    { sponsor: SponsorOption } | { error: string }
  >
  disabled?: boolean
}

export default function EventSponsorsField({
  eventType,
  availableSponsors,
  selectedSponsorIds,
  onChange,
  onCreateSponsor,
  disabled = false,
}: EventSponsorsFieldProps) {
  const [newBusinessName, setNewBusinessName] = useState('')
  const [createError, setCreateError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const eligible = isSponsorshipEligibleEventType(eventType)

  const selectedSet = useMemo(
    () => new Set(selectedSponsorIds),
    [selectedSponsorIds]
  )

  const orderedSelected = useMemo(() => {
    const byId = new Map(availableSponsors.map((sponsor) => [sponsor.id, sponsor]))
    return selectedSponsorIds
      .map((id) => byId.get(id))
      .filter((sponsor): sponsor is SponsorOption => Boolean(sponsor))
  }, [availableSponsors, selectedSponsorIds])

  if (!eligible) {
    return null
  }

  const toggleSponsor = (sponsorId: string) => {
    if (selectedSet.has(sponsorId)) {
      onChange(selectedSponsorIds.filter((id) => id !== sponsorId))
      return
    }
    onChange([...selectedSponsorIds, sponsorId])
  }

  const moveSponsor = (sponsorId: string, direction: -1 | 1) => {
    const index = selectedSponsorIds.indexOf(sponsorId)
    if (index < 0) return
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= selectedSponsorIds.length) return
    const next = [...selectedSponsorIds]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    onChange(next)
  }

  const createSponsor = async () => {
    if (!onCreateSponsor) return
    setCreateError('')
    setIsCreating(true)
    const result = await onCreateSponsor(newBusinessName)
    setIsCreating(false)
    if ('error' in result) {
      setCreateError(result.error)
      return
    }
    setNewBusinessName('')
    if (!selectedSet.has(result.sponsor.id)) {
      onChange([...selectedSponsorIds, result.sponsor.id])
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Event sponsors</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Circle Socials and Premium events can have multiple sponsors. Order
          controls display order on the event page.
        </p>
      </div>

      {availableSponsors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sponsors yet. Add one below.
        </p>
      ) : (
        <ul className="grid max-h-56 gap-2 overflow-y-auto">
          {availableSponsors.map((sponsor) => {
            const checked = selectedSet.has(sponsor.id)
            return (
              <li key={sponsor.id}>
                <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:focus-visible]:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/30">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleSponsor(sponsor.id)}
                    className="mt-0.5"
                  />
                  <span>{sponsor.business_name}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {orderedSelected.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Display order
          </p>
          <ol className="grid gap-2">
            {orderedSelected.map((sponsor, index) => (
              <li
                key={sponsor.id}
                className="flex items-center justify-between gap-2 rounded-md bg-surface-elevated px-3 py-2 text-sm"
              >
                <span>
                  {index + 1}. {sponsor.business_name}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    className={buttonSecondaryClassName}
                    disabled={disabled || index === 0}
                    onClick={() => moveSponsor(sponsor.id, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className={buttonSecondaryClassName}
                    disabled={disabled || index === orderedSelected.length - 1}
                    onClick={() => moveSponsor(sponsor.id, 1)}
                  >
                    Down
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {onCreateSponsor ? (
        <div className="grid gap-2 border-t border-border pt-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Add new sponsor</span>
            <input
              className={inputClassName}
              value={newBusinessName}
              disabled={disabled || isCreating}
              onChange={(event) => setNewBusinessName(event.target.value)}
              placeholder="Business name"
            />
          </label>
          {createError ? (
            <p className="text-sm text-danger">{createError}</p>
          ) : null}
          <button
            type="button"
            className={buttonSecondaryClassName}
            disabled={disabled || isCreating || !newBusinessName.trim()}
            onClick={() => void createSponsor()}
          >
            {isCreating ? 'Adding…' : 'Add sponsor'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
