import type { ReactNode } from 'react'

/**
 * Members directory section order (single-column / mobile reading order):
 * 1. Page heading / approved status
 * 2. Optional approval notice
 * 3. Member directory
 * 4. Optional admin member management
 *
 * Dashboard modules (recent messages, curated intro) live on /dashboard.
 * Membership usage (“Your membership”) lives on Your Profile.
 */
export function MembersDashboardLayout({
  heading,
  approvalNotice,
  directory,
  admin,
}: {
  heading: ReactNode
  approvalNotice?: ReactNode
  directory: ReactNode
  admin?: ReactNode
}) {
  return (
    <>
      {heading}
      {approvalNotice ?? null}
      {directory}
      {admin ?? null}
    </>
  )
}

/** Ordered section keys for UI tests and layout documentation. */
export function membersDashboardSectionOrder(input: {
  showApprovalNotice: boolean
  showAdmin: boolean
}): string[] {
  const sections: string[] = ['heading']
  if (input.showApprovalNotice) sections.push('approval_notice')
  sections.push('directory')
  if (input.showAdmin) sections.push('admin')
  return sections
}

export function membersDashboardShowsMembershipUsage(): boolean {
  return false
}

export function yourProfileShowsMembershipUsage(): boolean {
  return true
}
