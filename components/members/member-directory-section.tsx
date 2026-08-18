'use client'

import { useMemo, useState } from 'react'
import EmptyState from '@/components/ui/empty-state'
import {
  DEFAULT_DISCOVERY_FILTERS,
  filterDirectoryMembers,
  type DirectoryMember,
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

  const filters: DiscoveryFilters = useMemo(
    () => ({
      ...DEFAULT_DISCOVERY_FILTERS,
      intentFilter,
    }),
    [intentFilter]
  )

  const filtered = useMemo(
    () => filterDirectoryMembers(members, filters),
    [members, filters]
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

      <p className="mt-4 text-xs text-muted-foreground">
        Showing {filtered.length} of {members.length} members
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try another connection filter."
        />
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member) => (
            <li key={member.id}>
              <MemberDiscoveryCard member={member} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
