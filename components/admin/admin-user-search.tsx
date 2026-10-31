'use client'

import { useRef, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import QuerySearchField from '@/components/ui/query-search-field'
import { normalizeAdminUserSearch } from '@/lib/admin-user-search'

export default function AdminUserSearch({ search }: { search: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const requestRef = useRef(0)
  const lastHref = useRef(hrefFor(pathname, search))

  function commit(value: string) {
    const href = hrefFor(pathname, value)
    if (href === lastHref.current) return
    lastHref.current = href
    const requestId = ++requestRef.current
    startTransition(() => {
      if (requestRef.current !== requestId) return
      router.push(href)
    })
  }

  return (
    <div className="mb-6">
      <QuerySearchField
        label="Search users"
        placeholder="Name or email"
        committedValue={search}
        onCommit={commit}
        isPending={isPending}
        pendingLabel="Searching users…"
      />
    </div>
  )
}

function hrefFor(pathname: string, search: string): string {
  const query = normalizeAdminUserSearch(search)
  if (!query) return pathname
  const params = new URLSearchParams()
  params.set('q', query)
  return `${pathname}?${params.toString()}`
}
