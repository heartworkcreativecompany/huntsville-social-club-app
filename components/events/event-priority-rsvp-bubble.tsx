import EventRsvpWindowCountdown from '@/components/events/event-rsvp-window-countdown'
import {
  formatEventWindowTimestamp,
  type EventRsvpWindowInfo,
} from '@/lib/event-rsvp-window'

export default function EventPriorityRsvpBubble({
  window,
}: {
  window: EventRsvpWindowInfo
}) {
  if (window.phase !== 'elite_priority' || !window.countdownEndsAt) {
    return null
  }

  const generalLabel = formatEventWindowTimestamp(window.generalOpensAt)

  return (
    <div className="mb-6 rounded-2xl border-2 border-accent bg-accent-soft/20 px-5 py-4">
      <p className="text-base font-semibold text-foreground">
        Priority RSVP window
      </p>
      <EventRsvpWindowCountdown endsAtIso={window.countdownEndsAt} />
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Priority RSVP is open for Elite Circle
        {generalLabel ? ` until ${generalLabel}` : ''}. General RSVP opens then.
      </p>
    </div>
  )
}
