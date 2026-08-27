'use client'

import { useMemo, useState } from 'react'
import EmptyState from '@/components/ui/empty-state'
import {
  DEFAULT_DIRECTORY_BROWSE_STATE,
  applyDirectoryBrowseModeChange,
  browseDirectoryMembers,
  directoryEmptyStateDescription,
  parseDirectoryBrowseState,
  parseDirectoryIndustryFilter,
  parseDirectoryIntentFilter,
  type DirectoryBrowseMode,
  type DirectoryIntentFilterValue,
  type DirectoryMember,
} from '@/lib/members-discovery'
import MemberDirectoryBrowseControls from './member-directory-browse-controls'
import MemberDiscoveryCard from './member-discovery-card'

export default function MemberDirectorySection({
  members,
}: {
  members: DirectoryMember[]
}) {
  const [browseState, setBrowseState] = useState(
    DEFAULT_DIRECTORY_BROWSE_STATE
  )

  const visible = useMemo(
    () => browseDirectoryMembers(members, browseState),
    [members, browseState]
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
      <MemberDirectoryBrowseControls
        state={browseState}
        onBrowseModeChange={(mode: DirectoryBrowseMode) =>
          setBrowseState((current) =>
            applyDirectoryBrowseModeChange(current, mode)
          )
        }
        onIntentFilterChange={(value: DirectoryIntentFilterValue) =>
          setBrowseState((current) =>
            parseDirectoryBrowseState({
              ...current,
              intentFilter: parseDirectoryIntentFilter(value),
            })
          )
        }
        onIndustryFilterChange={(value: string) =>
          setBrowseState((current) =>
            parseDirectoryBrowseState({
              ...current,
              industryFilter: parseDirectoryIndustryFilter(value),
            })
          )
        }
      />

      <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">
        Showing {visible.length} of {members.length} members
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title="No matches"
          description={directoryEmptyStateDescription(browseState.browseMode)}
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
