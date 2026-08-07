import EventRsvpWindowCountdown from '@/components/events/event-rsvp-window-countdown'
import {
  PREMIUM_BUBBLE_GOLD_CLASSNAME,
  formatEventWindowTimestamp,
  isElitePriorityWindowActive,
  type EventRsvpWindowInfo,
} from '@/lib/event-rsvp-window'

export default function EventPriorityRsvpBubble({
  window,
}: {
  window: EventRsvpWindowInfo
}) {
  if (!isElitePriorityWindowActive(window) || !window.countdownEndsAt) {
    return null
  }

  const generalLabel = formatEventWindowTimestamp(window.generalOpensAt)

  return (
    <div className={PREMIUM_BUBBLE_GOLD_CLASSNAME}>
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
