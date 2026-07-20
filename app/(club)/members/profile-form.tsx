'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ApplicationPhotosField from '@/components/application/application-photos-field'
import ChipMultiSelect from '@/components/application/chip-multi-select'
import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import type { ApplicationPhoto } from '@/lib/application'
import { INTEREST_OPTIONS } from '@/lib/application-form-content'
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
} from '@/lib/event-labels'
import { updateMemberProfile } from './actions'

type ProfileFormProps = {
  memberId: string
  displayName: string
  bio: string
  locationArea: string
  memberPublicIntents: MemberPublicIntentValue[]
  interests: string[]
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
            className={`${inputClassName} resize-y`}
            disabled={isPending}
          />
        </label>

        <button
          type="button"
          onClick={handleSave}
          className={buttonPrimaryClassName}
          disabled={isPending}
        >
          {isPending ? 'Submitting…' : 'Submit for review'}
        </button>

        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </Card>
  )
}
