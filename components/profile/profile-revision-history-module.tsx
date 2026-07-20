import Card from '@/components/ui/card'
import type { ProfileRevisionHistoryEntry } from '@/lib/profile-revision-history'
import { parseProfileRevisionHistory } from '@/lib/profile-revision-history'

export default function ProfileRevisionHistoryModule({
  historyRaw,
}: {
  historyRaw: unknown
}) {
  const history = parseProfileRevisionHistory(historyRaw)
    .slice()
    .reverse()
    .slice(0, 5)

  if (history.length === 0) return null

  return (
    <Card padding="sm">
      <p className="eyebrow">Revision history</p>
      <h2 className="text-display mt-1 text-lg font-semibold">
        Recent profile reviews
      </h2>
      <ul className="mt-4 grid gap-3 text-sm">
        {history.map((entry) => (
          <HistoryItem key={`${entry.reviewedAt}-${entry.status}`} entry={entry} />
        ))}
      </ul>
    </Card>
  )
}

function HistoryItem({ entry }: { entry: ProfileRevisionHistoryEntry }) {
  const reviewed = new Date(entry.reviewedAt).toLocaleString()
  const statusLabel = entry.status === 'approved' ? 'Approved' : 'Declined'

  return (
    <li className="rounded-lg border border-border bg-surface/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">{statusLabel}</span>
        <span className="text-xs text-muted-foreground">{reviewed}</span>
      </div>
      {entry.changedFields.length > 0 ? (
        <p className="mt-1 text-muted-foreground">
          Fields: {entry.changedFields.join(', ')}
        </p>
      ) : null}
      {entry.adminNotes ? (
        <p className="mt-1 text-foreground">
          <span className="font-medium">Staff note: </span>
          {entry.adminNotes}
        </p>
      ) : null}
    </li>
  )
}
