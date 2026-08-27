'use client'

import { inputClassName } from '@/lib/event-labels'
import { INDUSTRY_OPTIONS } from '@/lib/industries'
import {
  DIRECTORY_BROWSE_MODE_OPTIONS,
  DIRECTORY_INDUSTRY_SORT_HINT,
  parseDirectoryBrowseMode,
  parseDirectoryIndustryFilter,
  type DirectoryBrowseMode,
  type DirectoryBrowseState,
  type DirectoryIntentFilterValue,
} from '@/lib/members-discovery'
import MemberIntentFilterPills from './member-intent-filter-pills'

export const DIRECTORY_BROWSE_LAYOUT_CLASS = 'grid min-w-0 gap-3'
export const DIRECTORY_BROWSE_FIELD_CLASS = 'grid min-w-0 gap-1.5 text-sm'
export const DIRECTORY_INDUSTRY_HINT_CLASS = 'text-xs text-muted-foreground'

type MemberDirectoryBrowseControlsProps = {
  state: DirectoryBrowseState
  onBrowseModeChange: (mode: DirectoryBrowseMode) => void
  onIntentFilterChange: (value: DirectoryIntentFilterValue) => void
  onIndustryFilterChange: (value: string) => void
}

export default function MemberDirectoryBrowseControls({
  state,
  onBrowseModeChange,
  onIntentFilterChange,
  onIndustryFilterChange,
}: MemberDirectoryBrowseControlsProps) {
  const industryMode = state.browseMode === 'industry'

  return (
    <div className={DIRECTORY_BROWSE_LAYOUT_CLASS}>
      <label className={DIRECTORY_BROWSE_FIELD_CLASS}>
        <span className="font-medium text-foreground">Browse by</span>
        <select
          className={inputClassName}
          value={state.browseMode}
          onChange={(e) =>
            onBrowseModeChange(parseDirectoryBrowseMode(e.target.value))
          }
        >
          {DIRECTORY_BROWSE_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {industryMode ? (
        <div className="grid min-w-0 gap-1.5">
          <label className={DIRECTORY_BROWSE_FIELD_CLASS}>
            <span className="font-medium text-foreground">Industry</span>
            <select
              className={inputClassName}
              value={state.industryFilter}
              onChange={(e) =>
                onIndustryFilterChange(
                  parseDirectoryIndustryFilter(e.target.value)
                )
              }
            >
              <option value="all">All industries</option>
              {INDUSTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className={DIRECTORY_INDUSTRY_HINT_CLASS}>
            {DIRECTORY_INDUSTRY_SORT_HINT}
          </p>
        </div>
      ) : (
        <MemberIntentFilterPills
          value={state.intentFilter}
          onChange={onIntentFilterChange}
        />
      )}
    </div>
  )
}
