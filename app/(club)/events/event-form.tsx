'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import {
  parseDatetimeLocalToIso,
  parseFeeDollarsToCents,
} from '@/lib/membership-tier-config'

type EventFormProps = {
  userId: string
  /** Admin/host can create all types and publish immediately. */
  isAdminCreator?: boolean
  /** Paid members may only create standard events pending approval. */
  canCreateStandardOnly?: boolean
}

function getEventInsertErrorMessage(error: {
  message: string
  code?: string
}): string {
  const msg = error.message.toLowerCase()
  const isPermissionDenied =
    error.code === '42501' ||
    error.code === 'PGRST301' ||
    msg.includes('permission') ||
    msg.includes('policy') ||
    msg.includes('row-level security') ||
    msg.includes('row level security') ||
    msg.includes('not authorized') ||
    msg.includes('violates')

  if (isPermissionDenied) {
    return 'You do not have permission to create events.'
  }

  return error.message
}

export default function EventForm({
  userId,
  isAdminCreator = false,
  canCreateStandardOnly = false,
}: EventFormProps) {
  const supabase = createClient()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [description, setDescription] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [visibility, setVisibility] = useState('members')
  const [eventType, setEventType] = useState('standard_event')
  const [status, setStatus] = useState(
    isAdminCreator ? 'published' : 'pending_approval'
  )
  const [feeDollars, setFeeDollars] = useState('')
  const [priorityRsvpOpensAt, setPriorityRsvpOpensAt] = useState('')
  const [generalRsvpOpensAt, setGeneralRsvpOpensAt] = useState('')
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setMessage('Saving...')

    const resolvedType = canCreateStandardOnly ? 'standard_event' : eventType
    const resolvedStatus = canCreateStandardOnly
      ? 'pending_approval'
      : isAdminCreator
        ? status
        : 'pending_approval'
    const sponsorshipEligible =
      resolvedType === 'circle_social' || resolvedType === 'premium_event'

    let feeCents: number | null = null
    let priorityIso: string | null = null
    let generalIso: string | null = null

    if (isAdminCreator) {
      try {
        feeCents = parseFeeDollarsToCents(feeDollars)
        priorityIso = parseDatetimeLocalToIso(priorityRsvpOpensAt)
        generalIso = parseDatetimeLocalToIso(generalRsvpOpensAt)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Invalid fee or RSVP window.')
        return
      }
    }

    const { data: newEvent, error: eventError } = await supabase
      .from('events')
      .insert({
        owner_id: userId,
        title,
        location,
        starts_at: startsAt,
        description: description || null,
        ends_at: endsAt || null,
        visibility,
        event_type: resolvedType,
        status: resolvedStatus,
        sponsorship_eligible: sponsorshipEligible,
        ...(isAdminCreator
          ? {
              fee_cents: feeCents,
              priority_rsvp_opens_at: priorityIso,
              general_rsvp_opens_at: generalIso,
            }
          : {}),
      })
      .select('id')
      .single()

    if (eventError) {
      setMessage(getEventInsertErrorMessage(eventError))
      return
    }

    if (resolvedStatus === 'published') {
      const { error: attendeeError } = await supabase.from('event_attendees').upsert({
        event_id: newEvent.id,
        user_id: userId,
        status: 'going',
      })

      if (attendeeError) {
        setMessage(
          `Event created, but could not add you as an attendee: ${attendeeError.message}`
        )
        router.refresh()
        return
      }
    }

    setTitle('')
    setLocation('')
    setStartsAt('')
    setDescription('')
    setEndsAt('')
    setVisibility('members')
    setFeeDollars('')
    setPriorityRsvpOpensAt('')
    setGeneralRsvpOpensAt('')
    setStatus(isAdminCreator ? 'published' : 'pending_approval')
    setMessage(
      resolvedStatus === 'pending_approval'
        ? 'Event submitted for admin approval.'
        : 'Event created successfully.'
    )
    router.refresh()
  }

  return (
    <Card>
      <div className="grid gap-4">
        {canCreateStandardOnly ? (
          <p className="text-sm text-muted-foreground">
            Paid members can create standard events. An admin must approve before
            the event is published.
          </p>
        ) : null}

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

        {isAdminCreator ? (
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className={inputClassName}
          >
            <option value="standard_event">Standard event</option>
            <option value="circle_social">Circle Social (admin)</option>
            <option value="premium_event">Premium event (admin)</option>
          </select>
        ) : null}

        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className={inputClassName}
        >
          <option value="private">Private</option>
          <option value="members">Members</option>
          <option value="public">Public</option>
        </select>

        {isAdminCreator ? (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClassName}
          >
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending approval</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>
        ) : null}

        {isAdminCreator ? (
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
            <p className="text-xs text-muted-foreground">
              Leave RSVP windows empty to keep registration open for all eligible
              members. Entitlement rules are unchanged by these fields.
            </p>
          </div>
        ) : null}

        <button type="button" onClick={handleSave} className={buttonPrimaryClassName}>
          {canCreateStandardOnly ? 'Submit for approval' : 'Save event'}
        </button>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </Card>
  )
}
