import Link from 'next/link'
import Card from '@/components/ui/card'

export const ADMIN_MEMBER_MANAGEMENT_HREF = '/admin/users' as const
export const ADMIN_MEMBER_MANAGEMENT_HEADING = 'Member management' as const
export const ADMIN_MEMBER_MANAGEMENT_CTA = 'Manage member profiles →' as const

export default function AdminMemberManagementCard() {
  return (
    <Card className="mb-10" padding="sm">
      <h2 className="text-display text-lg font-semibold">
        {ADMIN_MEMBER_MANAGEMENT_HEADING}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Review member profiles, recognition badges, complimentary access,
        roles, and roster status.
      </p>
      <Link
        href={ADMIN_MEMBER_MANAGEMENT_HREF}
        className="mt-4 inline-block text-sm font-medium text-accent underline"
      >
        {ADMIN_MEMBER_MANAGEMENT_CTA}
      </Link>
    </Card>
  )
}
