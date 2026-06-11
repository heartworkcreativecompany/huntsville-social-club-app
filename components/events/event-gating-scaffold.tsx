import type { EventEligibility } from '@/lib/event-eligibility'

export default function EventGatingScaffold({
  eligibility,
}: {
  eligibility: EventEligibility
}) {
  if (!eligibility.showWaitlistScaffold && !eligibility.showCheckInScaffold) {
    return null
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
      {eligibility.showWaitlistScaffold ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-3">
          <p className="eyebrow">Waitlist</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Coming soon — join queue when invite-only events are enforced.
          </p>
          <button
            type="button"
            disabled
            className="mt-2 cursor-not-allowed text-xs font-medium text-muted-foreground opacity-60"
          >
            Join waitlist (not active)
          </button>
        </div>
      ) : null}
      {eligibility.showCheckInScaffold ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-3">
          <p className="eyebrow">Check-in</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Host check-in and day-of verification will live here.
          </p>
        </div>
      ) : null}
    </div>
  )
}
