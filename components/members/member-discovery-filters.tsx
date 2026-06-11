'use client'

import { inputClassName } from '@/lib/event-labels'
import {
  AGE_FILTER_OPTIONS,
  DEFAULT_DISCOVERY_FILTERS,
  INTENT_FILTER_OPTIONS,
  ROLE_FILTER_OPTIONS,
  type DiscoveryFilters,
} from '@/lib/members-discovery'

type MemberDiscoveryFiltersProps = {
  filters: DiscoveryFilters
  onChange: (filters: DiscoveryFilters) => void
  resultCount: number
  totalCount: number
  interestOptions: string[]
}

export default function MemberDiscoveryFilters({
  filters,
  onChange,
  resultCount,
  totalCount,
  interestOptions,
}: MemberDiscoveryFiltersProps) {
  const patch = (partial: Partial<DiscoveryFilters>) => {
    onChange({ ...filters, ...partial })
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1.5 text-sm sm:col-span-2 lg:col-span-3">
          <span className="font-medium text-foreground">Search</span>
          <input
            type="search"
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Name or bio"
            className={inputClassName}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Intent</span>
          <select
            value={filters.intentFilter}
            onChange={(e) =>
              patch({
                intentFilter: e.target
                  .value as DiscoveryFilters['intentFilter'],
              })
            }
            className={inputClassName}
          >
            {INTENT_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Age</span>
          <select
            value={filters.ageFilter}
            onChange={(e) =>
              patch({
                ageFilter: e.target.value as DiscoveryFilters['ageFilter'],
              })
            }
            className={inputClassName}
          >
            {AGE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Location</span>
          <input
            type="search"
            value={filters.locationQuery}
            onChange={(e) => patch({ locationQuery: e.target.value })}
            placeholder="Area, city, or ZIP"
            className={inputClassName}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Interests</span>
          <input
            type="search"
            list="discovery-interests"
            value={filters.interestFilter}
            onChange={(e) => patch({ interestFilter: e.target.value })}
            placeholder="e.g. Outdoors"
            className={inputClassName}
          />
          <datalist id="discovery-interests">
            {interestOptions.map((interest) => (
              <option key={interest} value={interest} />
            ))}
          </datalist>
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Industry</span>
          <input
            type="search"
            value={filters.industryFilter}
            onChange={(e) => patch({ industryFilter: e.target.value })}
            placeholder="e.g. Technology"
            className={inputClassName}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Role</span>
          <select
            value={filters.roleFilter}
            onChange={(e) =>
              patch({
                roleFilter: e.target.value as DiscoveryFilters['roleFilter'],
              })
            }
            className={inputClassName}
          >
            {ROLE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => patch({ verifiedOnly: e.target.checked })}
            className="mt-0.5"
          />
          <span className="leading-snug text-muted-foreground">
            Verified members only
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {resultCount} of {totalCount} members
        </span>
        <button
          type="button"
          className="font-medium text-accent underline"
          onClick={() => onChange({ ...DEFAULT_DISCOVERY_FILTERS })}
        >
          Clear filters
        </button>
      </div>
    </div>
  )
}
