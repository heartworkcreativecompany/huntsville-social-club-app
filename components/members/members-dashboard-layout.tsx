import type { ReactNode } from 'react'

/**
 * Members dashboard section order (single-column / mobile reading order):
 * 1. Page heading / approved status
 * 2. Member discovery (directory) + optional approval notice / admin
 * 3. Recent Messages
 * 4. Curated Intro
 *
 * Membership usage (“Your membership”) is intentionally not a dashboard section —
 * it lives on Your Profile.
 */
export function MembersDashboardLayout({
  heading,
  approvalNotice,
  directory,
  admin,
  recentMessages,
  curatedIntro,
}: {
  heading: ReactNode
  approvalNotice?: ReactNode
  directory: ReactNode
  admin?: ReactNode
  recentMessages?: ReactNode
  curatedIntro?: ReactNode
}) {
  return (
    <>
      {heading}
      {approvalNotice ?? null}
      {directory}
      {admin ?? null}
      {recentMessages ?? null}
      {curatedIntro ?? null}
    </>
  )
}

/** Ordered section keys for UI tests and layout documentation. */
export function membersDashboardSectionOrder(input: {
  showApprovalNotice: boolean
  showAdmin: boolean
  showRecentMessages: boolean
  showCuratedIntro: boolean
}): string[] {
  const sections: string[] = ['heading']
  if (input.showApprovalNotice) sections.push('approval_notice')
  sections.push('directory')
  if (input.showAdmin) sections.push('admin')
  if (input.showRecentMessages) sections.push('recent_messages')
  if (input.showCuratedIntro) sections.push('curated_intro')
  return sections
}

export function membersDashboardShowsMembershipUsage(): boolean {
  return false
}

export function yourProfileShowsMembershipUsage(): boolean {
  return true
}
