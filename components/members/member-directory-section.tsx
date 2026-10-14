'use client'

import EmptyState from '@/components/ui/empty-state'
import QuerySearchField from '@/components/ui/query-search-field'
import {
  directoryPageCount,
  directoryResultSummary,
} from '@/lib/directory-pagination'
import {
  DEFAULT_DIRECTORY_BROWSE_STATE,
  directoryNoResultsDescription,
  type DirectoryBrowseMode,
  type DirectoryBrowseState,
  type DirectoryIntentFilterValue,
  type DirectoryMember,
} from '@/lib/members-discovery'
import MemberDirectoryBrowseControls from './member-directory-browse-controls'
import MemberDirectoryPagination from './member-directory-pagination'
import MemberDiscoveryCard from './member-discovery-card'

export const MEMBER_DIRECTORY_GRID_CLASS =
  'mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'

type MemberDirectorySectionProps = {
  members: DirectoryMember[]
  matchCount?: number
  eligibleCount?: number
  page?: number
  browseState?: DirectoryBrowseState
  search?: string
  loadError?: string | null
  isPending?: boolean
  onBrowseModeChange?: (mode: DirectoryBrowseMode) => void
  onIntentFilterChange?: (value: DirectoryIntentFilterValue) => void
  onIndustryFilterChange?: (value: string) => void
  onSearchCommit?: (value: string) => void
  onSearchValueChange?: (value: string) => void
  pageHref?: (page: number) => string
}

export default function MemberDirectorySection({
  members,
  matchCount = members.length,
  eligibleCount = members.length,
  page = 1,
  browseState = DEFAULT_DIRECTORY_BROWSE_STATE,
  search = '',
  loadError = null,
  isPending = false,
  onBrowseModeChange,
  onIntentFilterChange,
  onIndustryFilterChange,
  onSearchCommit,
  onSearchValueChange,
  pageHref = (pageNumber) => `#page-${pageNumber}`,
}: MemberDirectorySectionProps) {
  if (eligibleCount === 0 && !loadError) {
    return (
      <EmptyState
        title="No members to discover yet"
        description="As the roster grows, verified profiles will appear here."
      />
    )
  }

  const pageCount = directoryPageCount(matchCount)
  const summary = directoryResultSummary(page, matchCount)

  return (
    <>
      <div className="grid min-w-0 gap-4">
        <QuerySearchField
          label="Search members"
          placeholder="Search by name"
          committedValue={search}
          onCommit={onSearchCommit ?? (() => undefined)}
          onValueChange={onSearchValueChange}
          isPending={isPending}
          pendingLabel="Loading members…"
        />
        <MemberDirectoryBrowseControls
          state={browseState}
          onBrowseModeChange={onBrowseModeChange ?? (() => undefined)}
          onIntentFilterChange={onIntentFilterChange ?? (() => undefined)}
          onIndustryFilterChange={onIndustryFilterChange ?? (() => undefined)}
        />
      </div>

      <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">
        {summary}
      </p>

      {loadError ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          Could not load directory: {loadError}
        </p>
      ) : matchCount === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No matches"
            description={directoryNoResultsDescription(browseState, search)}
          />
        </div>
      ) : (
        <ul className={MEMBER_DIRECTORY_GRID_CLASS} aria-busy={isPending}>
          {members.map((member) => (
            <li key={member.id}>
              <MemberDiscoveryCard member={member} />
            </li>
          ))}
        </ul>
      )}

      {loadError ? null : (
        <MemberDirectoryPagination
          page={page}
          pageCount={pageCount}
          pageHref={pageHref}
        />
      )}
    </>
  )
}
