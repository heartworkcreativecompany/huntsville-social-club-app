'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/card'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import type { ApplicationDraft, ApplicationStatus } from '@/lib/application'
import { canEditApplication } from '@/lib/application'
import { saveApplicationDraft, submitApplication } from './actions'

const STEPS = [
  { id: 1, title: 'About you' },
  { id: 2, title: 'Local connection' },
  { id: 3, title: 'Review & submit' },
]

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

  return (
    <div id="form" className="scroll-mt-8">
    <Card>
      <div className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => update({ step: step.id })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              draft.step === step.id
                ? 'bg-accent text-accent-foreground'
                : 'bg-accent-soft text-muted-foreground'
            }`}
          >
            {step.id}. {step.title}
          </button>
        ))}
      </div>

      {applicationStatus === 'needs_info' && adminNotes ? (
        <div className="mb-6 rounded-lg border border-warning/30 bg-warning-soft/40 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Reviewer notes</p>
          <p className="mt-1">{adminNotes}</p>
        </div>
      ) : null}

      {draft.step === 1 ? (
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Full name</span>
            <input
              className={inputClassName}
              value={draft.fullName}
              onChange={(e) => update({ fullName: e.target.value })}
              placeholder="Your full name"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Membership intent</span>
            <span className="text-xs text-muted-foreground">
              Why you want to join and how you hope to contribute.
            </span>
            <textarea
              className={`${inputClassName} resize-y`}
              rows={4}
              value={draft.membershipIntent}
              onChange={(e) => update({ membershipIntent: e.target.value })}
              placeholder="A thoughtful paragraph is enough."
            />
          </label>
        </div>
      ) : null}

      {draft.step === 2 ? (
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Huntsville area</span>
            <input
              className={inputClassName}
              value={draft.locationArea}
              onChange={(e) => update({ locationArea: e.target.value })}
              placeholder="Neighborhood or region"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">How did you hear about us?</span>
            <input
              className={inputClassName}
              value={draft.referralSource}
              onChange={(e) => update({ referralSource: e.target.value })}
              placeholder="Member referral, event, etc."
            />
          </label>
        </div>
      ) : null}

      {draft.step === 3 ? (
        <div className="grid gap-4 text-sm">
          <dl className="grid gap-3 rounded-lg border border-border bg-background/50 p-4">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium text-foreground">
                {draft.fullName || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Intent</dt>
              <dd className="leading-relaxed text-foreground">
                {draft.membershipIntent || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Area</dt>
              <dd className="font-medium text-foreground">
                {draft.locationArea || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Referral</dt>
              <dd className="font-medium text-foreground">
                {draft.referralSource || '—'}
              </dd>
            </div>
          </dl>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={draft.acknowledgements}
              onChange={(e) => update({ acknowledgements: e.target.checked })}
              className="mt-1"
            />
            <span className="text-muted-foreground">
              I understand membership is selective, verified, and based on trust.
              Information provided will be reviewed by the club.
            </span>
          </label>
        </div>
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
        {draft.step < 3 ? (
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
        {draft.step === 3 ? (
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
