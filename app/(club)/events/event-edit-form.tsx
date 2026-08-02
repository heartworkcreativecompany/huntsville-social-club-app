'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import {
  formatFeeCents,
  toDatetimeLocalValue,
} from '@/lib/membership-tier-config'
import { updateEvent } from '@/app/(club)/events/actions'
import { uploadEventCoverImage } from '@/lib/event-image-storage'

type EventEditFormProps = {
  eventId: string
  initialTitle: string
  initialLocation: string | null
  initialStartsAt: string
  initialDescription: string | null
  initialEndsAt: string | null
  initialEventType: string
  initialStatus?: string | null
  initialFeeCents?: number | null
  initialPriorityRsvpOpensAt?: string | null
  initialGeneralRsvpOpensAt?: string | null
  initialAttendanceMax?: number | null
  initialCoverImageUrl?: string | null
  /** Admins can edit type, status, fee, and RSVP windows. */
  isAdminEditor?: boolean
}

export default function EventEditForm({
  eventId,
  initialTitle,
  initialLocation,
  initialStartsAt,
  initialDescription,
  initialEndsAt,
  initialEventType,
  initialStatus = 'pending_approval',
  initialFeeCents = null,
  initialPriorityRsvpOpensAt = null,
  initialGeneralRsvpOpensAt = null,
  initialAttendanceMax = null,
  initialCoverImageUrl = null,
  isAdminEditor = false,
}: EventEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(initialTitle)
  const [location, setLocation] = useState(initialLocation ?? '')
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(initialStartsAt))
  const [description, setDescription] = useState(initialDescription ?? '')
  const [endsAt, setEndsAt] = useState(toDatetimeLocalValue(initialEndsAt))
  const [eventType, setEventType] = useState(initialEventType || 'standard_event')
  const [status, setStatus] = useState(initialStatus || 'pending_approval')
  const [feeDollars, setFeeDollars] = useState(formatFeeCents(initialFeeCents))
  const [priorityRsvpOpensAt, setPriorityRsvpOpensAt] = useState(
    toDatetimeLocalValue(initialPriorityRsvpOpensAt)
  )
  const [generalRsvpOpensAt, setGeneralRsvpOpensAt] = useState(
    toDatetimeLocalValue(initialGeneralRsvpOpensAt)
  )
  const [attendanceMax, setAttendanceMax] = useState(
    initialAttendanceMax != null ? String(initialAttendanceMax) : ''
  )
  const [coverImageUrl, setCoverImageUrl] = useState(initialCoverImageUrl ?? '')
  const [coverImageName, setCoverImageName] = useState(
    initialCoverImageUrl ? 'Current cover image' : ''
  )
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [message, setMessage] = useState('')

  const onCoverImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setMessage('')
    setIsUploadingImage(true)
    const result = await uploadEventCoverImage(file)
    setIsUploadingImage(false)

    if (result.error) {
      setMessage(result.error)
      return
    }

    setCoverImageUrl(result.url ?? '')
    setCoverImageName(file.name)
  }

  const clearCoverImage = () => {
    setCoverImageUrl('')
    setCoverImageName('')
  }

  const handleSave = () => {
    setMessage('Saving...')
    startTransition(async () => {
      const result = await updateEvent({
        eventId,
        title,
        location,
        startsAt,
        description,
        endsAt,
        attendanceMax,
        coverImageUrl,
        ...(isAdminEditor
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

      setMessage('Event updated successfully.')
      router.refresh()
    })
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

        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Event image
          </label>
          <p className="text-xs text-muted-foreground">
            Optional cover image. JPEG, PNG, or WebP up to 5 MB.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
            disabled={isUploadingImage || isPending}
            onChange={onCoverImageChange}
          />
          {isUploadingImage ? (
            <p className="text-xs text-muted-foreground">Uploading image…</p>
          ) : null}
          {coverImageUrl ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageUrl}
                alt="Event cover preview"
                className="h-20 w-32 rounded-md object-cover"
              />
              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">
                  {coverImageName || 'Image ready'}
                </p>
                <button
                  type="button"
                  className={buttonSecondaryClassName}
                  disabled={isPending || isUploadingImage}
                  onClick={clearCoverImage}
                >
                  Remove image
                </button>
              </div>
            </div>
          ) : null}
        </div>

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

        {isAdminEditor ? (
          <>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className={inputClassName}
              aria-label="Event type"
            >
              <option value="standard_event">Standard event</option>
              <option value="circle_social">Circle Social</option>
              <option value="premium_event">Premium event</option>
            </select>

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
          </>
        ) : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || isUploadingImage}
          className={buttonPrimaryClassName}
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  )
}
