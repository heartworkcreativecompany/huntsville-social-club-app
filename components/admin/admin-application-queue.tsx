'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { AdminApplicationPhotoThumbnail } from '@/components/admin/admin-application-photo-gallery'
import {
  applicationStatusLabel,
  QUEUE_STATUSES,
  type ApplicationStatus,
} from '@/lib/application'
import { inputClassName } from '@/lib/event-labels'

export type QueueApplicant = {
  id: string
  email: string | null
  full_name: string | null
  application_status: ApplicationStatus
  membership_intent: string | null
  application_submitted_at: string | null
  displayName: string
  photoCount: number
  photos: { id: string; storagePath: string; isPrimary: boolean; facePhotoConfirmed: boolean }[]
}

export default function AdminApplicationQueue({
  applicants,
}: {
  applicants: QueueApplicant[]
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>(
    'all'
  )

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    return applicants.filter((row) => {
      if (statusFilter !== 'all' && row.application_status !== statusFilter) {
        return false
      }

      if (!normalized) return true

      const haystack = [
        row.full_name,
        row.email,
        row.displayName,
        row.membership_intent,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalized)
    })
  }, [applicants, query, statusFilter])

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5 text-sm">
          <span className="font-medium text-foreground">Search</span>
          <input
            type="search"
            placeholder="Name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1.5 text-sm sm:w-48">
          <span className="font-medium text-foreground">Status</span>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ApplicationStatus | 'all')
            }
            className={inputClassName}
          >
            <option value="all">All statuses</option>
            {QUEUE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {applicationStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching applications"
          description="Try a different search or status filter."
        />
      ) : (
        <ul className="grid gap-4">
          {filtered.map((applicant) => (
            <li key={applicant.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <AdminApplicationPhotoThumbnail
                      applicantId={applicant.id}
                      photos={applicant.photos}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/admin/applications/${applicant.id}`}
                        className="text-display text-lg font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-accent"
                      >
                        {applicant.full_name ??
                          applicant.displayName ??
                          applicant.email ??
                          'Applicant'}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {applicant.email ?? 'No email'}
                      </p>
                    </div>
                  </div>
                  <ApplicationStatusBadge status={applicant.application_status} />
                </div>
                {applicant.membership_intent ? (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {applicant.membership_intent}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {applicationStatusLabel(applicant.application_status)}
                  {applicant.application_submitted_at
                    ? ` · Submitted ${new Date(applicant.application_submitted_at).toLocaleString()}`
                    : ' · Not yet submitted'}
                  {applicant.photoCount > 0
                    ? ` · ${applicant.photoCount} photo${applicant.photoCount === 1 ? '' : 's'}`
                    : ''}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
