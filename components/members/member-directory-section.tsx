'use client'

import { useMemo, useState } from 'react'
import EmptyState from '@/components/ui/empty-state'
import { inputClassName } from '@/lib/event-labels'
import { INDUSTRY_OPTIONS } from '@/lib/industries'
import {
  DEFAULT_DISCOVERY_FILTERS,
  filterDirectoryMembers,
  sortDirectoryMembers,
  type DirectoryMember,
  type DirectorySort,
  type DiscoveryFilters,
  type IntentFilterValue,
} from '@/lib/members-discovery'
import MemberDiscoveryCard from './member-discovery-card'
import MemberIntentFilterPills from './member-intent-filter-pills'

export default function MemberDirectorySection({
  members,
}: {
  members: DirectoryMember[]
}) {
  const [intentFilter, setIntentFilter] = useState<IntentFilterValue>('all')
  const [industryFilter, setIndustryFilter] = useState('all')
  const [sort, setSort] = useState<DirectorySort>('name')

  const filters: DiscoveryFilters = useMemo(
    () => ({
      ...DEFAULT_DISCOVERY_FILTERS,
      intentFilter,
      industryFilter: industryFilter === 'all' ? '' : industryFilter,
    }),
    [intentFilter, industryFilter]
  )

  const visible = useMemo(
    () => sortDirectoryMembers(filterDirectoryMembers(members, filters), sort),
    [members, filters, sort]
  )

  if (members.length === 0) {
    return (
      <EmptyState
        title="No members to discover yet"
        description="As the roster grows, verified profiles will appear here."
      />
    )
  }

  return (
    <>
      <MemberIntentFilterPills value={intentFilter} onChange={setIntentFilter} />

      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1.5 text-sm">
          <span className="font-medium text-foreground">Industry</span>
          <select
            className={inputClassName}
            value={industryFilter}
            aria-label="Filter members by industry"
            onChange={(e) => setIndustryFilter(e.target.value)}
          >
            <option value="all">All industries</option>
            {INDUSTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm">
          <span className="font-medium text-foreground">Sort</span>
          <select
            className={inputClassName}
            value={sort}
            aria-label="Sort members"
            onChange={(e) => setSort(e.target.value as DirectorySort)}
          >
            <option value="name">Name: A–Z</option>
            <option value="industry">Industry: A–Z</option>
          </select>
        </label>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Showing {visible.length} of {members.length} members
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try another connection or industry filter."
        />
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((member) => (
            <li key={member.id}>
              <MemberDiscoveryCard member={member} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
