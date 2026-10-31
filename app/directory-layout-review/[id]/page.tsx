import Link from 'next/link'
import { notFound } from 'next/navigation'
import { directoryLayoutReviewEnabled } from '@/lib/directory-layout-review'
import VisualViewportFrame from '@/components/shell/visual-viewport-frame'
import {
  directoryHref,
  parseDirectoryQuery,
  type MemberDirectorySearchParams,
} from '@/lib/member-directory-query'
import { directoryBackHref } from '@/lib/directory-return'

export const dynamic = 'force-dynamic'

export default async function DirectoryLayoutReviewProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<MemberDirectorySearchParams>
}) {
  if (!directoryLayoutReviewEnabled()) notFound()

  const { id } = await params
  const query = await searchParams
  const reviewDirectoryHref = directoryHref(
    '/directory-layout-review',
    parseDirectoryQuery(query)
  )

  return (
    <VisualViewportFrame>
      <div
        data-club-content-scroll
        className="min-h-0 flex-1 overflow-y-auto px-5 py-10"
      >
        <Link
          href={reviewDirectoryHref}
          data-review-back={reviewDirectoryHref}
          className="text-sm text-accent underline"
        >
          ← Back to members
        </Link>
        <p className="mt-4 text-xs text-muted-foreground">
          Production fallback: {directoryBackHref(query)}
        </p>
        <h1 className="font-brand mt-6 text-3xl font-semibold">Profile {id}</h1>
      </div>
    </VisualViewportFrame>
  )
}
