'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ApplicationPhotosField from '@/components/application/application-photos-field'
import ApplicationStepProgress from '@/components/application/application-step-progress'
import ChipMultiSelect from '@/components/application/chip-multi-select'
import Card from '@/components/ui/card'
import {
  AGREEMENT_ITEMS,
  APPLICATION_FORM_INTRO,
  APPLICATION_PROMPTS,
  APPLICATION_TOTAL_STEPS,
  EVENT_INTEREST_OPTIONS,
  GENDER_OPTIONS,
  INTEREST_MAX,
  INTEREST_MIN,
  INTEREST_OPTIONS,
  LIFESTYLE_TAG_OPTIONS,
  PROMPT_MAX_CHARS,
  PROMPT_MIN_REQUIRED,
  US_STATE_OPTIONS,
} from '@/lib/application-form-content'
import type { ApplicationDraft, ApplicationStatus } from '@/lib/application'
import { canEditApplication } from '@/lib/application'
import { completedPromptCount } from '@/lib/application-validation'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import { saveApplicationDraft, submitApplication } from './actions'

function FieldLabel({
  children,
  hint,
  privateField,
}: {
  children: React.ReactNode
  hint?: string
  privateField?: boolean
}) {
  return (
    <span className="grid gap-1">
      <span className="font-medium text-foreground">
        {children}
        {privateField ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            (private)
          </span>
        ) : null}
      </span>
      {hint ? (
        <span className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </span>
  )
}

export default function ApplicationForm({
  initialDraft,
  applicationStatus,
  adminNotes,
}: {
  initialDraft: ApplicationDraft
  applicationStatus: ApplicationStatus
  adminNotes: string | null
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(initialDraft)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const editable = canEditApplication(applicationStatus)

  if (!editable) {
    return null
  }

  const update = (patch: Partial<ApplicationDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const updateProfile = (patch: Partial<ApplicationDraft['profile']>) => {
    setDraft((prev) => ({
      ...prev,
      profile: { ...prev.profile, ...patch },
    }))
  }

  const updateLocation = (patch: Partial<ApplicationDraft['location']>) => {
    setDraft((prev) => ({
      ...prev,
      location: { ...prev.location, ...patch },
    }))
  }

  const updateWork = (
    patch: Partial<ApplicationDraft['workAndInterests']>
  ) => {
    setDraft((prev) => ({
      ...prev,
      workAndInterests: { ...prev.workAndInterests, ...patch },
    }))
  }

  const updatePrompts = (patch: Partial<ApplicationDraft['prompts']>) => {
    setDraft((prev) => ({
      ...prev,
      prompts: { ...prev.prompts, ...patch },
    }))
  }

  const updateAgreements = (
    patch: Partial<ApplicationDraft['agreements']>
  ) => {
    setDraft((prev) => ({
      ...prev,
      agreements: { ...prev.agreements, ...patch },
    }))
  }

  const handleSave = () => {
    setMessage('')
    startTransition(async () => {
      const result = await saveApplicationDraft(draft)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setMessage('Draft saved. You can return anytime to continue.')
      router.refresh()
    })
  }

  const handleSubmit = () => {
    setMessage('')
    startTransition(async () => {
      const saveResult = await saveApplicationDraft(draft)
      if (saveResult.error) {
        setMessage(saveResult.error)
        return
      }

      const result = await submitApplication()
      if (result.error) {
        setMessage(result.error)
        return
      }

      setMessage('Application submitted for review.')
      router.refresh()
    })
  }

  const promptsDone = completedPromptCount(draft)

  return (
    <div id="form" className="scroll-mt-8">
      <Card>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          {APPLICATION_FORM_INTRO}
        </p>

        <ApplicationStepProgress currentStep={draft.step} />

        {applicationStatus === 'needs_info' && adminNotes ? (
          <div className="mb-6 rounded-lg border border-warning/30 bg-warning-soft/40 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Reviewer notes</p>
            <p className="mt-1">{adminNotes}</p>
          </div>
        ) : null}

        {draft.step === 1 ? (
          <section className="grid gap-5">
            <div>
              <h3 className="text-display text-base font-medium text-foreground">
                Profile basics
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Your display name is public after approval. Legal name and date
                of birth stay private and are used only for verification.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <FieldLabel>First name</FieldLabel>
                <input
                  className={inputClassName}
                  value={draft.profile.firstName}
                  onChange={(e) => updateProfile({ firstName: e.target.value })}
                  autoComplete="given-name"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <FieldLabel privateField>Last name</FieldLabel>
                <input
                  className={inputClassName}
                  value={draft.profile.lastName}
                  onChange={(e) => updateProfile({ lastName: e.target.value })}
                  autoComplete="family-name"
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel hint="How other members will see you in the directory.">
                Display name
              </FieldLabel>
              <input
                className={inputClassName}
                value={draft.profile.displayName}
                onChange={(e) => updateProfile({ displayName: e.target.value })}
                placeholder="First name or preferred name"
                autoComplete="nickname"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel privateField>Date of birth</FieldLabel>
              <input
                type="date"
                className={inputClassName}
                value={draft.profile.dateOfBirth}
                onChange={(e) =>
                  updateProfile({ dateOfBirth: e.target.value })
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel hint="Optional. Used only if needed for club operations.">
                Gender
              </FieldLabel>
              <select
                className={inputClassName}
                value={draft.profile.gender}
                onChange={(e) => updateProfile({ gender: e.target.value })}
              >
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value || 'unset'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel hint="Optional.">Pronouns</FieldLabel>
              <input
                className={inputClassName}
                value={draft.profile.pronouns}
                onChange={(e) => updateProfile({ pronouns: e.target.value })}
                placeholder="she/her, he/him, they/them…"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel hint="Optional.">
                What you&apos;re looking for in the club
              </FieldLabel>
              <input
                className={inputClassName}
                value={draft.profile.lookingFor}
                onChange={(e) => updateProfile({ lookingFor: e.target.value })}
                placeholder="New friends, professional peers, activity partners…"
              />
            </label>
          </section>
        ) : null}

        {draft.step === 2 ? (
          <section className="grid gap-5">
            <div>
              <h3 className="text-display text-base font-medium text-foreground">
                Location
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                City, state, and ZIP are private. Only your neighborhood or area
                label is shown publicly after approval.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5 text-sm sm:col-span-2">
                <FieldLabel privateField>City</FieldLabel>
                <input
                  className={inputClassName}
                  value={draft.location.city}
                  onChange={(e) => updateLocation({ city: e.target.value })}
                  autoComplete="address-level2"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <FieldLabel privateField>State</FieldLabel>
                <select
                  className={inputClassName}
                  value={draft.location.state}
                  onChange={(e) => updateLocation({ state: e.target.value })}
                >
                  {US_STATE_OPTIONS.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel privateField>ZIP code</FieldLabel>
              <input
                className={inputClassName}
                value={draft.location.zipCode}
                onChange={(e) => updateLocation({ zipCode: e.target.value })}
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel hint="Public on your profile—keep it general (e.g. Downtown, Madison, Research Park).">
                Neighborhood or area
              </FieldLabel>
              <input
                className={inputClassName}
                value={draft.location.neighborhoodOrArea}
                onChange={(e) =>
                  updateLocation({ neighborhoodOrArea: e.target.value })
                }
                placeholder="Downtown Huntsville, Madison, Jones Valley…"
              />
            </label>
            <fieldset className="grid gap-2 text-sm">
              <FieldLabel>Do you live in the Huntsville metro area?</FieldLabel>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="livesInHuntsvilleArea"
                    checked={draft.location.livesInHuntsvilleArea === true}
                    onChange={() =>
                      updateLocation({
                        livesInHuntsvilleArea: true,
                        localConnection: '',
                      })
                    }
                  />
                  <span>Yes</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="livesInHuntsvilleArea"
                    checked={draft.location.livesInHuntsvilleArea === false}
                    onChange={() =>
                      updateLocation({ livesInHuntsvilleArea: false })
                    }
                  />
                  <span>No</span>
                </label>
              </div>
            </fieldset>
            {draft.location.livesInHuntsvilleArea === false ? (
              <label className="grid gap-1.5 text-sm">
                <FieldLabel privateField hint="How you stay connected to Huntsville—work, family, frequent visits, etc.">
                  Your connection to the area
                </FieldLabel>
                <textarea
                  className={`${inputClassName} resize-y`}
                  rows={3}
                  value={draft.location.localConnection}
                  onChange={(e) =>
                    updateLocation({ localConnection: e.target.value })
                  }
                />
              </label>
            ) : null}
          </section>
        ) : null}

        {draft.step === 3 ? (
          <section className="grid gap-5">
            <div>
              <h3 className="text-display text-base font-medium text-foreground">
                Work and interests
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Helps reviewers understand how you&apos;ll contribute. Employer
                details stay private unless you choose to share them later.
              </p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel>Occupation</FieldLabel>
              <input
                className={inputClassName}
                value={draft.workAndInterests.occupation}
                onChange={(e) => updateWork({ occupation: e.target.value })}
                placeholder="Role or field"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel hint="Recommended.">Industry</FieldLabel>
              <input
                className={inputClassName}
                value={draft.workAndInterests.industry}
                onChange={(e) => updateWork({ industry: e.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel privateField hint="Optional.">
                Employer / company
              </FieldLabel>
              <input
                className={inputClassName}
                value={draft.workAndInterests.employerCompany}
                onChange={(e) =>
                  updateWork({ employerCompany: e.target.value })
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <FieldLabel hint="Optional.">Education</FieldLabel>
              <input
                className={inputClassName}
                value={draft.workAndInterests.education}
                onChange={(e) => updateWork({ education: e.target.value })}
                placeholder="School, program, or certification"
              />
            </label>
            <div className="text-sm">
              <FieldLabel>Interests</FieldLabel>
              <ChipMultiSelect
                options={INTEREST_OPTIONS}
                selected={draft.workAndInterests.interests}
                onChange={(interests) => updateWork({ interests })}
                min={INTEREST_MIN}
                max={INTEREST_MAX}
              />
            </div>
            <div className="text-sm">
              <FieldLabel hint="Optional.">Lifestyle tags</FieldLabel>
              <ChipMultiSelect
                options={LIFESTYLE_TAG_OPTIONS}
                selected={draft.workAndInterests.lifestyleTags}
                onChange={(lifestyleTags) => updateWork({ lifestyleTags })}
              />
            </div>
            <div className="text-sm">
              <FieldLabel hint="Optional.">Event interests</FieldLabel>
              <ChipMultiSelect
                options={EVENT_INTEREST_OPTIONS}
                selected={draft.workAndInterests.eventInterests}
                onChange={(eventInterests) => updateWork({ eventInterests })}
              />
            </div>
          </section>
        ) : null}

        {draft.step === 4 ? (
          <section className="grid gap-5">
            <div>
              <h3 className="text-display text-base font-medium text-foreground">
                Short prompts
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Complete at least {PROMPT_MIN_REQUIRED} prompts (max{' '}
                {PROMPT_MAX_CHARS} characters each). These help reviewers get a
                feel for your voice—not a résumé.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {promptsDone} of {APPLICATION_PROMPTS.length} started ·{' '}
                {PROMPT_MIN_REQUIRED} required to submit
              </p>
            </div>
            {APPLICATION_PROMPTS.map((prompt) => {
              const value = draft.prompts[prompt.key]
              return (
                <label key={prompt.key} className="grid gap-1.5 text-sm">
                  <FieldLabel>{prompt.label}</FieldLabel>
                  <textarea
                    className={`${inputClassName} resize-y`}
                    rows={3}
                    maxLength={PROMPT_MAX_CHARS}
                    value={value}
                    onChange={(e) =>
                      updatePrompts({ [prompt.key]: e.target.value })
                    }
                    placeholder={prompt.placeholder}
                  />
                  <span className="text-xs text-muted-foreground">
                    {value.length}/{PROMPT_MAX_CHARS}
                  </span>
                </label>
              )
            })}
          </section>
        ) : null}

        {draft.step === 5 ? (
          <section className="grid gap-5">
            <div>
              <h3 className="text-display text-base font-medium text-foreground">
                Profile photos
              </h3>
            </div>
            <ApplicationPhotosField
              photos={draft.photos}
              onChange={(photos) => update({ photos })}
              disabled={isPending}
            />
          </section>
        ) : null}

        {draft.step === 6 ? (
          <section className="grid gap-5 text-sm">
            <div>
              <h3 className="text-display text-base font-medium text-foreground">
                Agreements
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Confirm the standards below, then submit for membership review.
              </p>
            </div>
            <dl className="grid gap-3 rounded-lg border border-border bg-background/50 p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Display name</dt>
                <dd className="font-medium text-foreground">
                  {draft.profile.displayName || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Public area</dt>
                <dd className="font-medium text-foreground">
                  {draft.location.neighborhoodOrArea || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Occupation</dt>
                <dd className="font-medium text-foreground">
                  {draft.workAndInterests.occupation || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Prompts completed</dt>
                <dd className="font-medium text-foreground">{promptsDone}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Photos</dt>
                <dd className="font-medium text-foreground">
                  {draft.photos.length}
                </dd>
              </div>
            </dl>
            <div className="grid gap-3">
              {AGREEMENT_ITEMS.map((item) => (
                <label key={item.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={draft.agreements[item.key]}
                    onChange={(e) =>
                      updateAgreements({ [item.key]: e.target.checked })
                    }
                    className="mt-1"
                  />
                  <span className="leading-relaxed text-muted-foreground">
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {draft.step > 1 ? (
            <button
              type="button"
              className={buttonSecondaryClassName}
              onClick={() => update({ step: draft.step - 1 })}
              disabled={isPending}
            >
              Back
            </button>
          ) : null}
          {draft.step < APPLICATION_TOTAL_STEPS ? (
            <button
              type="button"
              className={buttonPrimaryClassName}
              onClick={() => update({ step: draft.step + 1 })}
              disabled={isPending}
            >
              Continue
            </button>
          ) : null}
          <button
            type="button"
            className={buttonSecondaryClassName}
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? 'Saving…' : 'Save draft'}
          </button>
          {draft.step === APPLICATION_TOTAL_STEPS ? (
            <button
              type="button"
              className={buttonPrimaryClassName}
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? 'Submitting…' : 'Submit application'}
            </button>
          ) : null}
        </div>

        {message ? (
          <p className="mt-4 text-sm text-muted-foreground">{message}</p>
        ) : null}
      </Card>
    </div>
  )
}
