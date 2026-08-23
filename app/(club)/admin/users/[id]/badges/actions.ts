'use server'

import {
  awardMemberRecognitionBadgesAction as awardMemberRecognitionBadges,
  revokeMemberRecognitionBadgeAction as revokeMemberRecognitionBadge,
} from '@/app/(club)/admin/users/[id]/actions'

export async function awardMemberRecognitionBadgesAction(input: {
  memberId: string
  slugs: string[]
  adminNote?: string | null
}) {
  return awardMemberRecognitionBadges(input)
}

export async function revokeMemberRecognitionBadgeAction(input: {
  memberId: string
  slug: string
}) {
  return revokeMemberRecognitionBadge(input)
}
