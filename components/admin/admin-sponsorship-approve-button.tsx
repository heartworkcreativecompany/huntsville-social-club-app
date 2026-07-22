'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveEventSponsorship } from '@/app/(club)/admin/events/actions'
import { buttonSecondaryClassName } from '@/lib/event-labels'

export default function AdminSponsorshipApproveButton({
  sponsorshipId,
}: {
  sponsorshipId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className={buttonSecondaryClassName}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await approveEventSponsorship(sponsorshipId)
          router.refresh()
        })
      }
    >
      {isPending ? 'Saving…' : 'Mark approved'}
    </button>
  )
}
