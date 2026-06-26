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
  if (error) {
    return <p className="text-sm text-danger">{error}</p>
  }

  if (previews.length === 0) {
    return (
      <Card>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your inbox is quiet for now. Request intros from the Members page or
          connect at events — conversations will appear here.
        </p>
        <Link href="/members" className={`${buttonSecondaryClassName} mt-4 inline-flex`}>
          Browse members
        </Link>
      </Card>
    )
  }

  return (
    <ul className="grid gap-3">
      {previews.map((preview) => (
        <li key={preview.conversationId}>
          <Card
            padding="sm"
            className="transition hover:border-accent/25 hover:bg-surface-elevated/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-brand text-base font-semibold text-foreground">
                    {preview.otherUserName}
                  </p>
                  {preview.unread ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                      New
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {preview.lastMessage}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted" dateTime={preview.lastMessageAt}>
                {formatPreviewTime(preview.lastMessageAt)}
              </time>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}
