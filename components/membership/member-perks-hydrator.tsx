'use client'

import { useEffect } from 'react'
import {
  hydrateMemberPerksFromServer,
  membershipPerksSnapshotFromEntitlements,
} from '@/lib/member-perks-store'
import type { MemberEntitlements } from '@/lib/membership-entitlements'

/**
 * Keeps the shared member-perks store in sync with server entitlements
 * loaded in the club layout / pages (without clobbering fresher client updates).
 */
export default function MemberPerksHydrator({
  entitlements,
}: {
  entitlements: MemberEntitlements | null
}) {
  useEffect(() => {
    if (!entitlements) return
    if (
      entitlements.productTier !== 'inner_circle' &&
      entitlements.productTier !== 'elite_circle'
    ) {
      return
    }
    hydrateMemberPerksFromServer(
      membershipPerksSnapshotFromEntitlements(entitlements)
    )
  }, [
    entitlements,
    entitlements?.productTier,
    entitlements?.premiumCreditsRemaining,
    entitlements?.guestInvitesRemaining,
    entitlements?.activeCycle?.credits_granted,
    entitlements?.activeCycle?.period_start,
    entitlements?.activeCycle?.period_end,
  ])

  return null
}
