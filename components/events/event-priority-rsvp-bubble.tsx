import EventRsvpWindowCountdown from '@/components/events/event-rsvp-window-countdown'
import {
  PREMIUM_BUBBLE_GOLD_CLASSNAME,
  formatEventWindowTimestamp,
  shouldShowPriorityRsvpBubble,
  type EventRsvpWindowInfo,
} from '@/lib/event-rsvp-window'

export default function EventPriorityRsvpBubble({
  window,
}: {
  window: EventRsvpWindowInfo
}) {
  if (!shouldShowPriorityRsvpBubble(window) || !window.countdownEndsAt) {
    return null
  }

  const priorityLabel = formatEventWindowTimestamp(window.priorityOpensAt)
  const generalLabel = formatEventWindowTimestamp(window.generalOpensAt)
  const isLive = window.code === 'elite_priority'

  return (
    <div className={PREMIUM_BUBBLE_GOLD_CLASSNAME}>
      <p className="text-base font-semibold text-foreground">
        Priority RSVP window
      </p>
      <EventRsvpWindowCountdown
        endsAtIso={window.countdownEndsAt}
        label={window.countdownLabel ?? (isLive ? 'Ends in' : 'Opens in')}
      />
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {isLive ? (
          <>
            Priority RSVP is open for Elite Circle
            {generalLabel ? ` until ${generalLabel}` : ''}. General RSVP opens
            then.
          </>
        ) : (
          <>
            Priority RSVP opens for Elite Circle
            {priorityLabel ? ` at ${priorityLabel}` : ' soon'}
            {generalLabel ? `. General RSVP opens ${generalLabel}` : ''}.
          </>
        )}
      </p>
    </div>
  )
}
