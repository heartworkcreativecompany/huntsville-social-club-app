'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshApplicantIdentityStatus } from '@/app/(club)/admin/applications/actions'
import { buttonSecondaryClassName } from '@/lib/event-labels'

export default function RefreshIdentityStatusButton({
  applicantId,
}: {
  applicantId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="mt-4">
      <button
        type="button"
        className={buttonSecondaryClassName}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await refreshApplicantIdentityStatus(applicantId)
            if (result.error) {
              setError(result.error)
              return
            }
            router.refresh()
          })
        }
      >
        {isPending ? 'Refreshing…' : 'Refresh identity status from Stripe'}
      </button>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  )
}
