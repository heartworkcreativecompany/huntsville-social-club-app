'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics'

export function MemberProfileViewTracker({ memberId }: { memberId: string }) {
  useEffect(() => {
    trackEvent('member_profile_viewed', { member_id: memberId })
  }, [memberId])

  return null
}
