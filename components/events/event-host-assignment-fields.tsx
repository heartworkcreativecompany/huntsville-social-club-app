'use client'

import { useState } from 'react'
import { searchHostingMembers } from '@/app/(club)/events/host-actions'
import { buttonSecondaryClassName, inputClassName } from '@/lib/event-labels'
import {
  additionalHostSelectionError,
  additionalHostsAfterPrimaryChange,
  effectivePrimaryHostId,
  type AssignedHost,
} from '@/lib/event-host-assignment'

type HostSearchResult = {
  id: string
  fullName: string
  role: 'host' | 'admin'
}

type EventHostAssignmentFieldsProps = {
  primaryHost: AssignedHost | null
  additionalHosts: AssignedHost[]
  onPrimaryHostChange: (host: AssignedHost | null) => void
  onAdditionalHostsChange: (hosts: AssignedHost[]) => void
  disabled?: boolean
  /** Create form: null keeps this member as the named host. */
  creator?: AssignedHost | null
  creatorFallbackLabel?: string | null
}

function roleLabel(role: HostSearchResult['role']): string {
  return role === 'admin' ? 'Admin' : 'Host'
}

export default function EventHostAssignmentFields({
  primaryHost,
  additionalHosts,
  onPrimaryHostChange,
  onAdditionalHostsChange,
  disabled = false,
  creator = null,
  creatorFallbackLabel = null,
}: EventHostAssignmentFieldsProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HostSearchResult[]>([])
  const [status, setStatus] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const search = async () => {
    setStatus('')
    setIsSearching(true)
    const result = await searchHostingMembers(query)
    setIsSearching(false)
    if ('error' in result) {
      setResults([])
      setStatus(result.error)
      return
    }
    setResults(result.members)
    setStatus(
      result.members.length === 0
        ? 'No hosting-enabled members match that name.'
        : ''
    )
  }

  const effectivePrimaryId = effectivePrimaryHostId({
    selectedPrimaryHostId: primaryHost?.id,
    creatorId: creator?.id,
  })
  const creatorName = creator?.fullName.trim()

  const setPrimary = (host: HostSearchResult) => {
    onPrimaryHostChange({ id: host.id, fullName: host.fullName })
    onAdditionalHostsChange(
      additionalHostsAfterPrimaryChange(additionalHosts, host.id)
    )
    setStatus(`${host.fullName} is the primary host.`)
  }

  const useCreator = () => {
    onPrimaryHostChange(null)
    onAdditionalHostsChange(
      additionalHostsAfterPrimaryChange(additionalHosts, creator?.id)
    )
    setStatus('The event creator remains the primary host.')
  }

  const addAdditional = (host: HostSearchResult) => {
    const error = additionalHostSelectionError({
      hostId: host.id,
      selectedPrimaryHostId: primaryHost?.id,
      creatorId: creator?.id,
      additionalHostIds: additionalHosts.map((current) => current.id),
    })
    if (error) {
      setStatus(error)
      return
    }
    onAdditionalHostsChange([
      ...additionalHosts,
      { id: host.id, fullName: host.fullName },
    ])
    setStatus(`${host.fullName} was added as an additional host.`)
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Event hosts</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose members who already have hosting abilities. Saving a host name
          does not change the event creator or who can edit, approve, or manage
          this event.
        </p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Primary host</p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {primaryHost?.fullName ?? (creatorName || 'You (event creator)')}
        </p>
        {creatorFallbackLabel ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {creatorFallbackLabel}
          </p>
        ) : null}
        {creatorFallbackLabel && primaryHost ? (
          <button
            type="button"
            className={`${buttonSecondaryClassName} mt-2`}
            disabled={disabled}
            onClick={useCreator}
          >
            Use the event creator
          </button>
        ) : null}
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Additional hosts</p>
        {additionalHosts.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">None</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {additionalHosts.map((host) => (
              <li
                key={host.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium text-foreground">{host.fullName}</span>
                <button
                  type="button"
                  className={buttonSecondaryClassName}
                  disabled={disabled}
                  onClick={() =>
                    onAdditionalHostsChange(
                      additionalHosts.filter((current) => current.id !== host.id)
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Search hosting members</span>
          <input
            type="search"
            value={query}
            disabled={disabled || isSearching}
            placeholder="Member name"
            aria-label="Search hosting members"
            className={inputClassName}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void search()
              }
            }}
          />
        </label>
        <button
          type="button"
          className={buttonSecondaryClassName}
          disabled={disabled || isSearching}
          onClick={() => void search()}
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {results.length > 0 ? (
        <ul className="grid gap-2">
          {results.map((host) => {
            const isPrimary = effectivePrimaryId === host.id
            const isAdditional = additionalHosts.some(
              (current) => current.id === host.id
            )
            return (
              <li
                key={host.id}
                className="rounded-lg border border-border px-3 py-2"
              >
                <p className="text-sm font-medium text-foreground">
                  {host.fullName}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {roleLabel(host.role)}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonSecondaryClassName}
                    disabled={disabled || isPrimary}
                    onClick={() => setPrimary(host)}
                  >
                    {isPrimary ? 'Primary host' : 'Set as primary host'}
                  </button>
                  <button
                    type="button"
                    className={buttonSecondaryClassName}
                    disabled={disabled || isPrimary || isAdditional}
                    onClick={() => addAdditional(host)}
                  >
                    {isAdditional ? 'Added' : 'Add as additional host'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </div>
  )
}
