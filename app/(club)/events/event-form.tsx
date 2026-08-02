'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import { createEvent } from '@/app/(club)/events/actions'

type EventFormProps = {
  /** Admin/host can create all types and choose publish status. */
  isAdminCreator?: boolean
  /** Paid members may only create standard events pending approval. */
  canCreateStandardOnly?: boolean
}

export default function EventForm({
  isAdminCreator = false,
  canCreateStandardOnly = false,
}: EventFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [description, setDescription] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [eventType, setEventType] = useState('standard_event')
  const [status, setStatus] = useState(
    isAdminCreator ? 'published' : 'pending_approval'
  )
  const [feeDollars, setFeeDollars] = useState('')
  const [priorityRsvpOpensAt, setPriorityRsvpOpensAt] = useState('')
  const [generalRsvpOpensAt, setGeneralRsvpOpensAt] = useState('')
  const [attendanceMax, setAttendanceMax] = useState('')
  const [message, setMessage] = useState('')

  const handleSave = () => {
    setMessage('Saving...')
    startTransition(async () => {
      const result = await createEvent({
        title,
        location,
        startsAt,
        description,
        endsAt,
        attendanceMax,
        ...(isAdminCreator
          ? {
              eventType,
              status,
              feeDollars,
              priorityRsvpOpensAt,
              generalRsvpOpensAt,
            }
          : {}),
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      setTitle('')
      setLocation('')
      setStartsAt('')
      setDescription('')
      setEndsAt('')
      setFeeDollars('')
      setPriorityRsvpOpensAt('')
      setGeneralRsvpOpensAt('')
      setAttendanceMax('')
      setEventType('standard_event')
      setStatus(isAdminCreator ? 'published' : 'pending_approval')
      setMessage(
        result.status === 'pending_approval'
          ? 'Event submitted for admin approval.'
          : 'Event created successfully.'
      )
      router.refresh()
    })
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

        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Attendance Max
          </label>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder="e.g. 40"
            value={attendanceMax}
            onChange={(e) => setAttendanceMax(e.target.value)}
            className={inputClassName}
          />
          <p className="text-xs text-muted-foreground">
            Optional. Leave blank for unlimited attendance.
          </p>
        </div>

        {isAdminCreator ? (
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className={inputClassName}
            aria-label="Event type"
          >
            <option value="standard_event">Standard event</option>
            <option value="circle_social">Circle Social (admin)</option>
            <option value="premium_event">Premium event (admin)</option>
          </select>
        ) : null}

        {isAdminCreator ? (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClassName}
            aria-label="Event status"
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

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={buttonPrimaryClassName}
        >
          {isPending
            ? 'Saving…'
            : canCreateStandardOnly
              ? 'Submit for approval'
              : 'Save event'}
        </button>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </Card>
  )
}
