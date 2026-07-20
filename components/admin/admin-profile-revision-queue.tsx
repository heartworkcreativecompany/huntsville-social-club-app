'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AdminApplicationPhotoGallery from '@/components/admin/admin-application-photo-gallery'
import {
  approveProfileRevision,
  rejectProfileRevision,
} from '@/app/(club)/admin/profile-revisions/actions'
import {
  buttonPrimaryClassName,
  inputClassName,
} from '@/lib/event-labels'
import {
  formatMemberPublicIntentsForDisplay,
  profileRevisionFieldLabels,
  type ProfileRevisionDiff,
} from '@/lib/profile-revision'

export type ProfileRevisionQueueItem = {
  id: string
  email: string | null
  full_name: string | null
  submittedAt: string | null
  diff: ProfileRevisionDiff
}

function DiffRow({
  label,
  live,
  pending,
}: {
  label: string
  live: string
  pending: string
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface/50 p-4 sm:grid-cols-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Live — {label}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          {live || '—'}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Pending — {label}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          {pending || '—'}
        </p>
      </div>
    </div>
  )
}

export default function AdminProfileRevisionQueue({
  items,
}: {
  items: ProfileRevisionQueueItem[]
}) {
  const router = useRouter()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const runAction = (
    memberId: string,
    action: 'approve' | 'reject'
  ) => {
    setMessage('')
    startTransition(async () => {
      const adminNotes = notes[memberId]?.trim()
      const result =
        action === 'approve'
          ? await approveProfileRevision(memberId, adminNotes)
          : await rejectProfileRevision(memberId, adminNotes)

      if (result.error) {
        setMessage(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-danger">{message}</p> : null}

      {items.map((item) => {
        const { diff } = item
        const liveIntents = formatMemberPublicIntentsForDisplay(
          diff.memberPublicIntents.live
        )
        const pendingIntents = formatMemberPublicIntentsForDisplay(
          diff.memberPublicIntents.pending
        )

        return (
          <article
            key={item.id}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-display text-lg font-semibold">
                  {item.diff.displayName.pending ||
                    item.full_name ||
                    'Member'}
                </h2>
                <p className="text-sm text-muted-foreground">{item.email}</p>
                {item.submittedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Submitted {new Date(item.submittedAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonPrimaryClassName}
                  disabled={isPending}
                  onClick={() => runAction(item.id, 'approve')}
                >
                  Approve & publish
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  disabled={isPending}
                  onClick={() => runAction(item.id, 'reject')}
                >
                  Reject
                </button>
              </div>
            </div>

            {diff.changedFields.length > 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Changed: {diff.changedFields.join(', ')}
              </p>
            ) : null}

            <div className="mt-4 grid gap-3">
              {diff.displayName.changed ? (
                <DiffRow
                  label="Display name"
                  live={diff.displayName.live}
                  pending={diff.displayName.pending}
                />
              ) : null}

              {diff.locationArea.changed ? (
                <DiffRow
                  label="Public area"
                  live={diff.locationArea.live}
                  pending={diff.locationArea.pending}
                />
              ) : null}

              {diff.bio.changed ? (
                <DiffRow
                  label="About / bio"
                  live={diff.bio.live}
                  pending={diff.bio.pending}
                />
              ) : null}

              {diff.memberPublicIntents.changed ? (
                <DiffRow
                  label={profileRevisionFieldLabels().memberPublicIntents}
                  live={liveIntents || '—'}
                  pending={pendingIntents || '—'}
                />
              ) : null}

              {diff.interests.changed ? (
                <DiffRow
                  label="Interests"
                  live={diff.interests.live.join(', ') || '—'}
                  pending={diff.interests.pending.join(', ') || '—'}
                />
              ) : null}

              {diff.photos.changed ? (
                <div className="grid gap-4 rounded-lg border border-border bg-surface/50 p-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Live photos
                    </p>
                    <div className="mt-3">
                      <AdminApplicationPhotoGallery
                        applicantId={item.id}
                        photos={diff.photos.live}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-accent">
                      Pending photos
                    </p>
                    <div className="mt-3">
                      <AdminApplicationPhotoGallery
                        applicantId={item.id}
                        photos={diff.photos.pending}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <label className="mt-4 grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">
                Admin notes (optional)
              </span>
              <input
                type="text"
                value={notes[item.id] ?? ''}
                onChange={(e) =>
                  setNotes((current) => ({
                    ...current,
                    [item.id]: e.target.value,
                  }))
                }
                placeholder="Visible to member if rejected"
                className={inputClassName}
                disabled={isPending}
              />
            </label>
          </article>
        )
      })}
    </div>
  )
}
