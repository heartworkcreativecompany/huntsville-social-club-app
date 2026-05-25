type RsvpCounts = {
  going: number
  maybe: number
  not_going: number
}

export default function EventRsvpCounts({
  counts,
  showCaption = true,
}: {
  counts: RsvpCounts
  showCaption?: boolean
}) {
  const total = counts.going + counts.maybe + counts.not_going

  return (
    <div>
      {showCaption ? (
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          RSVP summary
        </p>
      ) : null}
      <div
        className={`flex flex-wrap gap-3 ${showCaption ? 'mt-2' : ''}`}
        aria-label="RSVP counts"
      >
        <div className="min-w-[4.5rem] rounded-lg border border-border bg-background/60 px-3 py-2 text-center">
          <p className="text-display text-xl font-medium text-foreground">
            {counts.going}
          </p>
          <p className="text-xs text-muted-foreground">Going</p>
        </div>
        <div className="min-w-[4.5rem] rounded-lg border border-border bg-background/60 px-3 py-2 text-center">
          <p className="text-display text-xl font-medium text-foreground">
            {counts.maybe}
          </p>
          <p className="text-xs text-muted-foreground">Maybe</p>
        </div>
        <div className="min-w-[4.5rem] rounded-lg border border-border bg-background/60 px-3 py-2 text-center">
          <p className="text-display text-xl font-medium text-foreground">
            {counts.not_going}
          </p>
          <p className="text-xs text-muted-foreground">Not going</p>
        </div>
        <div className="flex items-center text-xs text-muted-foreground">
          {total === 0 ? 'No responses yet' : `${total} total responses`}
        </div>
      </div>
      {showCaption ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Names are shown on the event detail page only.
        </p>
      ) : null}
    </div>
  )
}
