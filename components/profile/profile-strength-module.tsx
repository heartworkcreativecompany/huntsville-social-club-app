import Badge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import type { ProfileCompletionItem } from '@/lib/profile-completion'

export default function ProfileStrengthModule({
  percent,
  items,
}: {
  percent: number
  items: ProfileCompletionItem[]
}) {
  const remaining = items.filter((item) => !item.done)

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Profile strength</p>
          <h2 className="text-display mt-1 text-lg font-semibold">
            {percent}% complete
          </h2>
        </div>
        <Badge variant={percent >= 80 ? 'success' : 'premium'}>
          {percent >= 80 ? 'Strong' : 'In progress'}
        </Badge>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completion"
        />
      </div>

      {remaining.length > 0 ? (
        <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
          {remaining.slice(0, 4).map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Your profile is in great shape for discovery and intros.
        </p>
      )}
    </Card>
  )
}
