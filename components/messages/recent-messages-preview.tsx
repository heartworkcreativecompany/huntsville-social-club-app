import Link from 'next/link'
import Card from '@/components/ui/card'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import type { MessagePreview } from '@/lib/member-messages'

function formatPreviewTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export default function RecentMessagesPreview({
  previews,
  error,
}: {
  previews: MessagePreview[]
  error: string | null
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Inbox</p>
          <h2 className="text-display mt-1 text-xl font-semibold">Recent messages</h2>
        </div>
        <Link href="/messages" className={buttonSecondaryClassName}>
          Open inbox
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : previews.length === 0 ? (
        <Card padding="sm">
          <p className="text-sm text-muted-foreground">
            No messages yet. When you connect with members, conversations will show
            up here.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {previews.map((preview) => (
            <li key={preview.conversationId}>
              <Link href="/messages" className="block no-underline">
                <Card
                  padding="sm"
                  className="transition hover:border-accent/25 hover:bg-surface-elevated/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-brand text-sm font-semibold text-foreground">
                        {preview.otherUserName}
                        {preview.unread ? (
                          <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
                        ) : null}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
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
      )}
    </section>
  )
}
