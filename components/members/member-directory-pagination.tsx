import Link from 'next/link'
import {
  directoryPageTokens,
  type DirectoryPageToken,
} from '@/lib/directory-pagination'

const pageButtonClassName =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 font-brand text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

type MemberDirectoryPaginationProps = {
  page: number
  pageCount: number
  pageHref: (page: number) => string
}

function pageLabel(token: DirectoryPageToken, current: number): string {
  if (token === 'ellipsis') return 'Skipped pages'
  if (token === current) return `Page ${token}, current`
  return `Page ${token}`
}

export default function MemberDirectoryPagination({
  page,
  pageCount,
  pageHref,
}: MemberDirectoryPaginationProps) {
  if (pageCount <= 1) return null

  const tokens = directoryPageTokens(page, pageCount)
  const previousDisabled = page <= 1
  const nextDisabled = page >= pageCount

  return (
    <nav
      aria-label="Member directory pages"
      className="mt-6 flex flex-wrap items-center justify-center gap-2"
    >
      {previousDisabled ? (
        <button
          type="button"
          disabled
          className={`${pageButtonClassName} cursor-not-allowed border-border text-muted-foreground opacity-50`}
        >
          Previous
        </button>
      ) : (
        <Link
          href={pageHref(page - 1)}
          className={`${pageButtonClassName} border-border bg-surface text-foreground hover:border-accent/40`}
        >
          Previous
        </Link>
      )}

      <ol className="flex flex-wrap items-center justify-center gap-2">
        {tokens.map((token, index) =>
          token === 'ellipsis' ? (
            <li key={`ellipsis-${index}`}>
              <span aria-hidden="true" className="px-1 text-muted-foreground">
                …
              </span>
              <span className="sr-only">Skipped pages</span>
            </li>
          ) : (
            <li key={token}>
              <Link
                href={pageHref(token)}
                aria-label={pageLabel(token, page)}
                aria-current={token === page ? 'page' : undefined}
                className={
                  token === page
                    ? `${pageButtonClassName} border-accent bg-accent text-accent-foreground`
                    : `${pageButtonClassName} border-border bg-surface text-foreground hover:border-accent/40`
                }
              >
                {token}
              </Link>
            </li>
          )
        )}
      </ol>

      {nextDisabled ? (
        <button
          type="button"
          disabled
          className={`${pageButtonClassName} cursor-not-allowed border-border text-muted-foreground opacity-50`}
        >
          Next
        </button>
      ) : (
        <Link
          href={pageHref(page + 1)}
          className={`${pageButtonClassName} border-border bg-surface text-foreground hover:border-accent/40`}
        >
          Next
        </Link>
      )}
    </nav>
  )
}
