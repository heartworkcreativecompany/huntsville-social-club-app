'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ApplicationPhotosField from '@/components/application/application-photos-field'
import ChipMultiSelect from '@/components/application/chip-multi-select'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import type { ApplicationPhoto } from '@/lib/application'
import {
  CONNECTION_OPEN_TO_OPTIONS,
  SOCIAL_VIBE_OPTIONS,
} from '@/lib/application-fields'
import {
  EVENT_INTEREST_OPTIONS,
  INTEREST_OPTIONS,
  LIFESTYLE_TAG_OPTIONS,
  PROMPT_MAX_CHARS,
} from '@/lib/application-form-content'
import type { ProfileRevisionStatus } from '@/lib/profile-revision'
import { photosEqual } from '@/lib/profile-revision'
import {
  CONNECTION_LOOKING_FOR_FIELD,
  CONNECTION_TYPES_OPEN_TO_FIELD,
  MEMBER_PUBLIC_INTENT_LABELS,
  memberPublicIntentLabelsFromValues,
  memberPublicIntentValuesFromLabels,
  type MemberPublicIntentValue,
} from '@/lib/member-public-intent'
import {
  buttonPrimaryClassName,
  inputClassName,
  mobileFullButtonClassName,
  textareaClassName,
} from '@/lib/event-labels'
import { updateMemberProfile } from './actions'

type ProfileFormProps = {
  memberId: string
  displayName: string
  bio: string
  locationArea: string
  memberPublicIntents: MemberPublicIntentValue[]
  interests: string[]
  occupation: string
  industry: string
  lifestyleTags: string[]
  eventInterests: string[]
  socialVibe: string
  connectionsOpenTo: string[]
  perfectWeekend: string
  favoriteLocalActivities: string
  icebreaker: string
  livePhotos: ApplicationPhoto[]
  editorPhotos: ApplicationPhoto[]
  revisionStatus?: ProfileRevisionStatus
  pendingFieldLabels?: string[]
}

export default function ProfileForm({
  memberId,
  displayName,
  bio,
  locationArea,
  memberPublicIntents,
  interests,
  occupation,
  industry,
  lifestyleTags,
  eventInterests,
  socialVibe,
  connectionsOpenTo,
  perfectWeekend,
  favoriteLocalActivities,
  icebreaker,
  livePhotos,
  editorPhotos,
  revisionStatus = 'none',
  pendingFieldLabels = [],
}: ProfileFormProps) {
  const router = useRouter()
  const [name, setName] = useState(displayName)
  const [about, setAbout] = useState(bio)
  const [area, setArea] = useState(locationArea)
  const [intentLabels, setIntentLabels] = useState(
    memberPublicIntentLabelsFromValues(memberPublicIntents)
  )
  const [selectedInterests, setSelectedInterests] = useState(interests)
  const [workTitle, setWorkTitle] = useState(occupation)
  const [workIndustry, setWorkIndustry] = useState(industry)
  const [selectedLifestyle, setSelectedLifestyle] = useState(lifestyleTags)
  const [selectedEventInterests, setSelectedEventInterests] =
    useState(eventInterests)
  const [vibe, setVibe] = useState(socialVibe)
  const [openTo, setOpenTo] = useState(connectionsOpenTo)
  const [weekend, setWeekend] = useState(perfectWeekend)
  const [localSpots, setLocalSpots] = useState(favoriteLocalActivities)
  const [icebreakerText, setIcebreakerText] = useState(icebreaker)
  const [photos, setPhotos] = useState(editorPhotos)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const photosDirty = !photosEqual(livePhotos, photos)
  const photosPendingReview =
    revisionStatus === 'pending' &&
    pendingFieldLabels.includes('Photos') &&
    !photosDirty

  const handleSave = () => {
    setMessage('')
    startTransition(async () => {
      const result = await updateMemberProfile({
        displayName: name,
        bio: about,
        locationArea: area,
        memberPublicIntents: memberPublicIntentValuesFromLabels(intentLabels),
        interests: selectedInterests,
        occupation: workTitle,
        industry: workIndustry,
        lifestyleTags: selectedLifestyle,
        eventInterests: selectedEventInterests,
        socialVibe: vibe,
        connectionsOpenTo: openTo,
        perfectWeekend: weekend,
        favoriteLocalActivities: localSpots,
        icebreaker: icebreakerText,
        photos,
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage(
        result.pending
          ? 'Changes submitted for review. Your live profile is unchanged until staff approves.'
          : 'Profile saved successfully.'
      )
      router.refresh()
    })
  }

  return (
    <Card>
      <h2 className="text-display text-lg font-semibold">Edit profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Text and photo updates are reviewed before going live in the member
        directory. Your approved profile stays public until staff approves
        changes.
      </p>
      {revisionStatus === 'pending' ? (
        <p className="mt-2 text-sm text-muted-foreground">
          You already have changes awaiting review. Saving again will replace
          that pending submission.
        </p>
      ) : null}
      {revisionStatus === 'rejected' ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Your last submission was declined. Edit and submit again when ready.
        </p>
      ) : null}

      <div className="mt-4 grid max-w-lg gap-6">
        <div className="grid gap-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">Profile photos</span>
            {photosPendingReview ? (
              <Badge variant="warning">Pending review</Badge>
            ) : photosDirty ? (
              <Badge variant="accent">Unsaved changes</Badge>
            ) : null}
          </div>
          <ApplicationPhotosField
            memberId={memberId}
            photos={photos}
            onChange={setPhotos}
            disabled={isPending}
            preserveStoragePaths={livePhotos.map((photo) => photo.storagePath)}
          />
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Display name</span>
          <input
            type="text"
            placeholder="How members see you"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName}
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Public area</span>
          <span className="text-xs text-muted-foreground">
            Neighborhood or general area — not your full address.
          </span>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. Downtown Huntsville"
            className={inputClassName}
            disabled={isPending}
          />
        </label>

        <div className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            {CONNECTION_LOOKING_FOR_FIELD.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {CONNECTION_LOOKING_FOR_FIELD.helper} Select Dating to unlock private
            curated match recommendations (requires an eligible paid membership).
          </span>
          <ChipMultiSelect
            options={MEMBER_PUBLIC_INTENT_LABELS}
            selected={intentLabels}
            onChange={setIntentLabels}
            min={1}
          />
        </div>

        <div className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            {CONNECTION_TYPES_OPEN_TO_FIELD.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {CONNECTION_TYPES_OPEN_TO_FIELD.helper}
          </span>
          <ChipMultiSelect
            options={[...CONNECTION_OPEN_TO_OPTIONS]}
            selected={openTo}
            onChange={setOpenTo}
          />
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">About / bio</span>
          <span className="text-xs text-muted-foreground">
            A short note on what you are hoping to find in the club community.
          </span>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="e.g. Building thoughtful local connections outside of work..."
            rows={4}
            className={textareaClassName}
            disabled={isPending}
          />
        </label>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Work</span>
            <input
              type="text"
              value={workTitle}
              onChange={(e) => setWorkTitle(e.target.value)}
              placeholder="Role or occupation"
              className={inputClassName}
              disabled={isPending}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Industry</span>
            <input
              type="text"
              value={workIndustry}
              onChange={(e) => setWorkIndustry(e.target.value)}
              placeholder="e.g. Technology"
              className={inputClassName}
              disabled={isPending}
            />
          </label>
        </div>

        <div className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Interests</span>
          <span className="text-xs text-muted-foreground">
            Shown on your public profile and used in member discovery filters.
          </span>
          <ChipMultiSelect
            options={INTEREST_OPTIONS}
            selected={selectedInterests}
            onChange={setSelectedInterests}
          />
        </div>

        <div className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Lifestyle</span>
          <ChipMultiSelect
            options={LIFESTYLE_TAG_OPTIONS}
            selected={selectedLifestyle}
            onChange={setSelectedLifestyle}
          />
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Event vibe</span>
          <select
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            className={inputClassName}
            disabled={isPending}
          >
            <option value="">Select a vibe</option>
            {SOCIAL_VIBE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Event interests</span>
          <ChipMultiSelect
            options={EVENT_INTEREST_OPTIONS}
            selected={selectedEventInterests}
            onChange={setSelectedEventInterests}
          />
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            A perfect weekend in Huntsville looks like…
          </span>
          <textarea
            value={weekend}
            onChange={(e) =>
              setWeekend(e.target.value.slice(0, PROMPT_MAX_CHARS))
            }
            rows={3}
            maxLength={PROMPT_MAX_CHARS}
            className={textareaClassName}
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            Favorite local activities or spots
          </span>
          <textarea
            value={localSpots}
            onChange={(e) =>
              setLocalSpots(e.target.value.slice(0, PROMPT_MAX_CHARS))
            }
            rows={3}
            maxLength={PROMPT_MAX_CHARS}
            className={textareaClassName}
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            A quick icebreaker about you
          </span>
          <textarea
            value={icebreakerText}
            onChange={(e) =>
              setIcebreakerText(e.target.value.slice(0, PROMPT_MAX_CHARS))
            }
            rows={3}
            maxLength={PROMPT_MAX_CHARS}
            className={textareaClassName}
            disabled={isPending}
          />
        </label>

        <button
          type="button"
          onClick={handleSave}
          className={`${buttonPrimaryClassName} ${mobileFullButtonClassName}`}
          disabled={isPending}
        >
          {isPending ? 'Submitting…' : 'Submit for review'}
        </button>

        {message ? (
          <p className="min-w-0 text-sm break-words text-muted-foreground">
            {message}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
