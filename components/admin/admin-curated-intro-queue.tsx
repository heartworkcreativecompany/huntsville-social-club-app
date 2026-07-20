import Link from 'next/link'
import Badge from '@/components/ui/badge'
import type { CuratedIntroQueueItem } from '@/lib/load-curated-intro-queue'

function statusBadgeVariant(
  status: string
): 'accent' | 'success' | 'muted' | 'warning' {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'matched':
      return 'success'
    case 'declined':
      return 'muted'
    default:
      return 'accent'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Awaiting recipient'
    case 'matched':
      return 'Accepted'
    case 'declined':
      return 'Declined'
    case 'closed':
      return 'Closed'
    default:
      return status
  }
}

export default function AdminCuratedIntroQueue({
  items,
}: {
  items: CuratedIntroQueueItem[]
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Message requests are accepted or declined by recipients. This queue is a
        read-only audit trail — staff no longer approve intros here.
      </p>

      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-display text-lg font-semibold">
                {item.requester.name}
                <span className="text-muted-foreground"> → </span>
                {item.target?.name ?? 'Unknown member'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {item.requester.email}
                {item.target?.email ? ` · ${item.target.email}` : ''}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Requested {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
            <Badge variant={statusBadgeVariant(item.status)}>
              {statusLabel(item.status)}
            </Badge>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface/50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Requesting member
              </dt>
              <dd className="mt-1">
                <Link
                  href={`/members/${item.requester.id}`}
                  className="font-medium text-accent underline"
                >
                  {item.requester.name}
                </Link>
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface/50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recipient
              </dt>
              <dd className="mt-1">
                {item.target ? (
                  <Link
                    href={`/members/${item.target.id}`}
                    className="font-medium text-accent underline"
                  >
                    {item.target.name}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            {item.conversationId ? (
              <div className="rounded-lg border border-border bg-surface/50 p-3 sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Conversation
                </dt>
                <dd className="mt-1">
                  <Link
                    href={`/messages/${item.conversationId}`}
                    className="font-medium text-accent underline"
                  >
                    View thread
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </article>
      ))}
    </div>
  )
}
