import type { EventEligibility } from '@/lib/event-eligibility'

const variantBorder: Record<EventEligibility['variant'], string> = {
  success: 'border-success/25 bg-success-soft/50',
  warning: 'border-warning/30 bg-warning-soft/40',
  muted: 'border-border bg-surface',
  danger: 'border-danger/25 bg-danger-soft/50',
}

export default function EventEligibilityBanner({
  eligibility,
  compact = false,
}: {
  eligibility: EventEligibility
  compact?: boolean
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${variantBorder[eligibility.variant]} ${compact ? 'text-sm' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-foreground">{eligibility.accessLabel}</p>
        <span className="eyebrow">{eligibility.tierLabel}</span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {eligibility.accessDescription}
      </p>
      {!compact ? (
        <p className="mt-2 text-xs text-muted-foreground">{eligibility.rsvpMessage}</p>
      ) : null}
    </div>
  )
}
