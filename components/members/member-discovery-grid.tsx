'use client'

import { useMemo, useState } from 'react'
import EmptyState from '@/components/ui/empty-state'
import {
  filterDirectoryMembers,
  type DirectoryMember,
  type RoleFilterValue,
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
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilterValue>('all')

  const filtered = useMemo(
    () => filterDirectoryMembers(members, query, roleFilter),
    [members, query, roleFilter]
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
        query={query}
        roleFilter={roleFilter}
        onQueryChange={setQuery}
        onRoleFilterChange={setRoleFilter}
        resultCount={filtered.length}
        totalCount={members.length}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try a different search or role filter."
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
