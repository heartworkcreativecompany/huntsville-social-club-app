'use client'

import { useMemo, useState } from 'react'
import EmptyState from '@/components/ui/empty-state'
import {
  collectInterestOptions,
  DEFAULT_DISCOVERY_FILTERS,
  filterDirectoryMembers,
  type DirectoryMember,
  type DiscoveryFilters,
} from '@/lib/members-discovery'
import MemberDiscoveryFilters from './member-discovery-filters'
import MemberProfileCard from './member-profile-card'

export default function MemberDiscoveryGrid({
  members,
  limited,
}: {
  members: DirectoryMember[]
  limited: boolean
}) {
  const [filters, setFilters] = useState<DiscoveryFilters>({
    ...DEFAULT_DISCOVERY_FILTERS,
  })

  const interestOptions = useMemo(
    () => collectInterestOptions(members),
    [members]
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
      <MemberDiscoveryFilters
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
        totalCount={members.length}
        interestOptions={interestOptions}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try adjusting intent, age, location, or verification filters."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((member) => (
            <li key={member.id}>
              <MemberProfileCard
                member={member}
                limited={limited}
                href={`/members/${member.id}`}
                compact
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
