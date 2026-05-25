'use client'

import { inputClassName } from '@/lib/event-labels'
import { ROLE_FILTER_OPTIONS, type RoleFilterValue } from '@/lib/members-discovery'

type MemberDiscoveryFiltersProps = {
  query: string
  roleFilter: RoleFilterValue
  onQueryChange: (value: string) => void
  onRoleFilterChange: (value: RoleFilterValue) => void
  resultCount: number
  totalCount: number
}

export default function MemberDiscoveryFilters({
  query,
  roleFilter,
  onQueryChange,
  onRoleFilterChange,
  resultCount,
  totalCount,
}: MemberDiscoveryFiltersProps) {
  return (
    <div className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[200px] flex-1">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Search</span>
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Name, intent, or role"
              className={inputClassName}
            />
          </label>
        </div>
        <div className="w-full sm:w-48">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Role</span>
            <select
              value={roleFilter}
              onChange={(e) =>
                onRoleFilterChange(e.target.value as RoleFilterValue)
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
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Showing {resultCount} of {totalCount} members
      </p>
    </div>
  )
}
