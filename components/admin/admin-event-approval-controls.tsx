'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approvePendingEvent,
  rejectPendingEvent,
} from '@/app/(club)/admin/events/actions'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'

export default function AdminEventApprovalControls({
  eventId,
}: {
  eventId: string
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
            await approvePendingEvent(eventId)
            router.refresh()
          })
        }
      >
        Approve & publish
      </button>
      <button
        type="button"
        className={buttonSecondaryClassName}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await rejectPendingEvent(eventId)
            router.refresh()
          })
        }
      >
        Reject
      </button>
    </div>
  )
}
