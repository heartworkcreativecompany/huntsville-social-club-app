'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reviewBusinessListing } from '@/app/(club)/business/actions'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'

export default function AdminBusinessListingReview({
  listingId,
}: {
  listingId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={buttonPrimaryClassName}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await reviewBusinessListing(listingId, 'approved')
            router.refresh()
          })
        }
      >
        Approve
      </button>
      <button
        type="button"
        className={buttonSecondaryClassName}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await reviewBusinessListing(listingId, 'rejected')
            router.refresh()
          })
        }
      >
        Reject
      </button>
    </div>
  )
}
