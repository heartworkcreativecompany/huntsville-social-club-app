'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import EventSponsorsField from '@/components/events/event-sponsors-field'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import { createEvent } from '@/app/(club)/events/actions'
import { createSponsorForAdmin } from '@/app/(club)/events/sponsor-actions'
import { uploadEventCoverImage } from '@/lib/event-image-storage'
import type { SponsorOption } from '@/lib/event-sponsors'

type EventFormProps = {
  /** Admin/host can create all types and choose publish status. */
  isAdminCreator?: boolean
  /** Admins can attach sponsors to Circle Social / Premium events. */
  canManageSponsors?: boolean
  availableSponsors?: SponsorOption[]
  /** Paid members may only create standard events pending approval. */
  canCreateStandardOnly?: boolean
}

export default function EventForm({
  isAdminCreator = false,
  canManageSponsors = false,
  availableSponsors: initialSponsors = [],
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
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [coverImageName, setCoverImageName] = useState('')
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [availableSponsors, setAvailableSponsors] =
    useState<SponsorOption[]>(initialSponsors)
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([])
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
      const result = await createEvent({
        title,
        location,
        startsAt,
        description,
        endsAt,
        attendanceMax,
        coverImageUrl,
        ...(isAdminCreator
          ? {
              eventType,
              status,
              feeDollars,
              priorityRsvpOpensAt,
              generalRsvpOpensAt,
            }
          : {}),
        ...(canManageSponsors ? { sponsorIds: selectedSponsorIds } : {}),
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
      clearCoverImage()
      setSelectedSponsorIds([])
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
            Event image
          </label>
          <p className="text-xs text-muted-foreground">
            Optional cover image for the event card and detail page. JPEG, PNG,
            or WebP up to 5 MB.
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

        {canManageSponsors ? (
          <EventSponsorsField
            eventType={eventType}
            availableSponsors={availableSponsors}
            selectedSponsorIds={selectedSponsorIds}
            onChange={setSelectedSponsorIds}
            disabled={isPending}
            onCreateSponsor={async (businessName) => {
              const result = await createSponsorForAdmin({ businessName })
              if ('sponsor' in result) {
                setAvailableSponsors((current) => {
                  if (current.some((row) => row.id === result.sponsor.id)) {
                    return current
                  }
                  return [...current, result.sponsor].sort((a, b) =>
                    a.business_name.localeCompare(b.business_name)
                  )
                })
              }
              return result
            }}
          />
        ) : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || isUploadingImage}
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
