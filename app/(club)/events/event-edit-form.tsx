'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import {
  formatFeeCents,
  parseDatetimeLocalToIso,
  parseFeeDollarsToCents,
  toDatetimeLocalValue,
} from '@/lib/membership-tier-config'

type EventEditFormProps = {
  eventId: string
  initialTitle: string
  initialLocation: string | null
  initialStartsAt: string
  initialDescription: string | null
  initialEndsAt: string | null
  initialVisibility: string
  initialEventType: string
  initialFeeCents?: number | null
  initialPriorityRsvpOpensAt?: string | null
  initialGeneralRsvpOpensAt?: string | null
  /** Only admins can edit fee and RSVP window fields. */
  isAdminEditor?: boolean
}

export default function EventEditForm({
  eventId,
  initialTitle,
  initialLocation,
  initialStartsAt,
  initialDescription,
  initialEndsAt,
  initialVisibility,
  initialEventType,
  initialFeeCents = null,
  initialPriorityRsvpOpensAt = null,
  initialGeneralRsvpOpensAt = null,
  isAdminEditor = false,
}: EventEditFormProps) {
  const supabase = createClient()
  const router = useRouter()

  const [title, setTitle] = useState(initialTitle)
  const [location, setLocation] = useState(initialLocation ?? '')
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(initialStartsAt))
  const [description, setDescription] = useState(initialDescription ?? '')
  const [endsAt, setEndsAt] = useState(toDatetimeLocalValue(initialEndsAt))
  const [visibility, setVisibility] = useState(initialVisibility)
  const [eventType, setEventType] = useState(initialEventType || 'standard_event')
  const [feeDollars, setFeeDollars] = useState(formatFeeCents(initialFeeCents))
  const [priorityRsvpOpensAt, setPriorityRsvpOpensAt] = useState(
    toDatetimeLocalValue(initialPriorityRsvpOpensAt)
  )
  const [generalRsvpOpensAt, setGeneralRsvpOpensAt] = useState(
    toDatetimeLocalValue(initialGeneralRsvpOpensAt)
  )
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setMessage('Saving...')

    const sponsorshipEligible =
      eventType === 'circle_social' || eventType === 'premium_event'

    let feeCents: number | null = null
    let priorityIso: string | null = null
    let generalIso: string | null = null

    if (isAdminEditor) {
      try {
        feeCents = parseFeeDollarsToCents(feeDollars)
        priorityIso = parseDatetimeLocalToIso(priorityRsvpOpensAt)
        generalIso = parseDatetimeLocalToIso(generalRsvpOpensAt)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Invalid fee or RSVP window.')
        return
      }
    }

    const { error } = await supabase
      .from('events')
      .update({
        title,
        location: location || null,
        starts_at: startsAt,
        description: description || null,
        ends_at: endsAt || null,
        visibility,
        event_type: eventType,
        sponsorship_eligible: sponsorshipEligible,
        ...(isAdminEditor
          ? {
              fee_cents: feeCents,
              priority_rsvp_opens_at: priorityIso,
              general_rsvp_opens_at: generalIso,
            }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Event updated successfully.')
    router.refresh()
  }

  return (
    <section>
      <div className="grid max-w-md gap-3">
        <input
          type="text"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClassName}
        />

        <input
          type="text"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={inputClassName}
        />

        <textarea
          placeholder="Event description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputClassName} min-h-[120px] resize-y`}
        />

        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className={inputClassName}
        />

        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className={inputClassName}
        />

        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className={inputClassName}
        >
          <option value="private">private</option>
          <option value="members">members</option>
          <option value="public">public</option>
        </select>

        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className={inputClassName}
          disabled={!isAdminEditor}
        >
          <option value="standard_event">Standard event</option>
          <option value="circle_social">Circle Social</option>
          <option value="premium_event">Premium event</option>
        </select>

        {isAdminEditor ? (
          <div className="grid gap-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">Admin event controls</p>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Event fee (USD)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 25 or 25.00"
                value={feeDollars}
                onChange={(e) => setFeeDollars(e.target.value)}
                className={inputClassName}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">
                Priority RSVP opens (Elite)
              </span>
              <input
                type="datetime-local"
                value={priorityRsvpOpensAt}
                onChange={(e) => setPriorityRsvpOpensAt(e.target.value)}
                className={inputClassName}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">General RSVP opens</span>
              <input
                type="datetime-local"
                value={generalRsvpOpensAt}
                onChange={(e) => setGeneralRsvpOpensAt(e.target.value)}
                className={inputClassName}
              />
            </label>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleSave}
          className={buttonPrimaryClassName}
        >
          Save Changes
        </button>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  )
}
