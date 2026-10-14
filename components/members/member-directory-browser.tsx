'use client'

import { useEffect, useRef, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  applyDirectoryBrowseModeChange,
  parseDirectoryBrowseState,
  parseDirectoryIndustryFilter,
  parseDirectoryIntentFilter,
  type DirectoryBrowseMode,
  type DirectoryBrowseState,
  type DirectoryIntentFilterValue,
  type DirectoryMember,
} from '@/lib/members-discovery'
import {
  directoryHref,
  type DirectoryQueryState,
} from '@/lib/member-directory-query'
import MemberDirectorySection from './member-directory-section'

type MemberDirectoryBrowserProps = {
  members: DirectoryMember[]
  matchCount: number
  eligibleCount: number
  page: number
  browseState: DirectoryBrowseState
  search: string
  loadError?: string | null
}

export default function MemberDirectoryBrowser({
  members,
  matchCount,
  eligibleCount,
  page,
  browseState,
  search,
  loadError = null,
}: MemberDirectoryBrowserProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const requestRef = useRef(0)
  const browseRef = useRef(browseState)
  const searchRef = useRef(search.trim())
  const serverSearchRef = useRef(search.trim())
  const serverHref = directoryHref(pathname, {
    search,
    browse: browseState,
    page,
  })
  const lastHref = useRef(serverHref)

  useEffect(() => {
    browseRef.current = browseState
  }, [browseState])

  useEffect(() => {
    const nextSearch = search.trim()
    if (searchRef.current === serverSearchRef.current) {
      searchRef.current = nextSearch
    }
    serverSearchRef.current = nextSearch
    lastHref.current = serverHref
  }, [search, serverHref])

  function navigate(next: DirectoryQueryState) {
    const href = directoryHref(pathname, next)
    if (href === lastHref.current) return
    lastHref.current = href
    const requestId = ++requestRef.current
    startTransition(() => {
      if (requestRef.current !== requestId) return
      router.push(href)
    })
  }

  function pageHref(pageNumber: number) {
    return directoryHref(pathname, {
      search: searchRef.current,
      browse: browseRef.current,
      page: pageNumber,
    })
  }

  return (
    <MemberDirectorySection
      members={members}
      matchCount={matchCount}
      eligibleCount={eligibleCount}
      page={page}
      browseState={browseState}
      search={search}
      loadError={loadError}
      isPending={isPending}
      pageHref={pageHref}
      onSearchValueChange={(value) => {
        searchRef.current = value.trim()
      }}
      onSearchCommit={(value) => {
        searchRef.current = value
        navigate({
          search: value,
          browse: parseDirectoryBrowseState(browseRef.current),
          page: 1,
        })
      }}
      onBrowseModeChange={(mode: DirectoryBrowseMode) => {
        const browse = applyDirectoryBrowseModeChange(browseRef.current, mode)
        browseRef.current = browse
        navigate({ search: searchRef.current, browse, page: 1 })
      }}
      onIntentFilterChange={(value: DirectoryIntentFilterValue) => {
        const browse = parseDirectoryBrowseState({
          ...browseRef.current,
          intentFilter: parseDirectoryIntentFilter(value),
        })
        browseRef.current = browse
        navigate({ search: searchRef.current, browse, page: 1 })
      }}
      onIndustryFilterChange={(value: string) => {
        const browse = parseDirectoryBrowseState({
          ...browseRef.current,
          industryFilter: parseDirectoryIndustryFilter(value),
        })
        browseRef.current = browse
        navigate({ search: searchRef.current, browse, page: 1 })
      }}
    />
  )
}
