import Link from 'next/link'
import Card from '@/components/ui/card'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import type { MessagePreview } from '@/lib/member-messages'

function formatPreviewTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function MessagesInbox({
  previews,
  error,
}: {
  previews: MessagePreview[]
  error: string | null
}) {
  const totalUnread = previews.reduce(
    (sum, preview) => sum + preview.unreadCount,
    0
  )

  if (error) {
    return <p className="text-sm text-danger">{error}</p>
  }

  if (previews.length === 0) {
    return (
      <Card>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your inbox is quiet for now. Send a message request from curated matches
          or the member directory — conversations appear here once a request is
          sent or accepted.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/matches" className={buttonSecondaryClassName}>
            Curated matches
          </Link>
          <Link href="/members" className={buttonSecondaryClassName}>
            Browse members
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {totalUnread > 0 ? (
        <p className="text-sm text-muted-foreground">
          {totalUnread} unread message{totalUnread === 1 ? '' : 's'} across your
          conversations.
        </p>
      ) : null}

      <ul className="grid gap-3">
        {previews.map((preview) => (
          <li key={preview.conversationId}>
            <Link
              href={`/messages/${preview.conversationId}`}
              className="block no-underline"
            >
              <Card
                padding="sm"
                className={`transition hover:border-accent/25 hover:bg-surface-elevated/40 ${
                  preview.unread ? 'border-accent/30 bg-accent-soft/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-brand text-base font-semibold text-foreground">
                        {preview.otherUserName}
                      </p>
                      {preview.isBlocked ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Unavailable
                        </span>
                      ) : null}
                      {preview.unreadCount > 0 ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                          {preview.unreadCount} new
                        </span>
                      ) : null}
                      {preview.status === 'pending' && !preview.viewerIsInitiator ? (
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
                          Request
                        </span>
                      ) : null}
                      {preview.status === 'pending' && preview.viewerIsInitiator ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Pending
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={`mt-2 line-clamp-3 text-sm leading-relaxed ${
                        preview.isEmpty && !preview.isBlocked
                          ? 'text-accent'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {preview.lastMessage}
                    </p>
                  </div>
                  <time
                    className="shrink-0 text-xs text-muted"
                    dateTime={preview.lastMessageAt}
                  >
                    {formatPreviewTime(preview.lastMessageAt)}
                  </time>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
