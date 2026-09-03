import Link from 'next/link'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { formatNotificationRelativeTime } from '@/lib/format-notification-time'
import type { MemberNotificationItem } from '@/lib/load-member-notifications'
import { isSafeInAppHref } from '@/lib/notification-ui'

export const DASHBOARD_NOTIFICATION_PREVIEW_LIMIT = 5

export const DASHBOARD_NOTIFICATIONS_EMPTY = {
  title: 'No recent notifications',
  description: 'New updates will appear here as your club activity grows.',
} as const

export { isSafeInAppHref }

export default function RecentNotifications({
  items,
  error,
}: {
  items: MemberNotificationItem[]
  error: string | null
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-display text-xl font-semibold">Recent notifications</h2>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : items.length === 0 ? (
        <EmptyState
          title={DASHBOARD_NOTIFICATIONS_EMPTY.title}
          description={DASHBOARD_NOTIFICATIONS_EMPTY.description}
        />
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => {
            const href = isSafeInAppHref(item.href) ? item.href : null
            const unread = !item.readAt
            const body = (
              <Card
                padding="sm"
                className={
                  href
                    ? 'transition hover:border-accent/25 hover:bg-surface-elevated/40'
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <p
                    className={`min-w-0 break-words text-sm ${
                      unread
                        ? 'font-semibold text-foreground'
                        : 'font-medium text-foreground'
                    }`}
                  >
                    {item.title}
                  </p>
                  {unread ? (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                      aria-hidden
                    />
                  ) : null}
                </div>
                {item.body ? (
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  {formatNotificationRelativeTime(item.createdAt)}
                </p>
              </Card>
            )

            return (
              <li key={item.id}>
                {href ? (
                  <Link href={href} className="block no-underline">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
