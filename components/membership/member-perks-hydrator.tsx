'use client'

import { useEffect } from 'react'
import {
  hydrateMemberPerksFromServer,
  membershipPerksSnapshotFromEntitlements,
} from '@/lib/member-perks-store'
import type { MemberEntitlements } from '@/lib/membership-entitlements'

/**
 * Keeps the shared member-perks store in sync with server entitlements.
 * Free members hydrate a zeroed snapshot so stale Elite/Inner credits cannot linger.
 */
export default function MemberPerksHydrator({
  entitlements,
}: {
  entitlements: MemberEntitlements | null
}) {
  useEffect(() => {
    if (!entitlements) return
    hydrateMemberPerksFromServer(
      membershipPerksSnapshotFromEntitlements(entitlements)
    )
  }, [
    entitlements?.productTier,
    entitlements?.premiumCreditsRemaining,
    entitlements?.guestInvitesRemaining,
    entitlements?.activeCycle?.credits_granted,
    entitlements?.activeCycle?.period_start,
    entitlements?.activeCycle?.period_end,
    entitlements?.subscriptionActive,
  ])

  return null
}
