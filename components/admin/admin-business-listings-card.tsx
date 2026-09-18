import Link from 'next/link'
import Card from '@/components/ui/card'

export const ADMIN_BUSINESS_LISTINGS_HREF = '/admin/business-listings' as const
export const ADMIN_BUSINESS_LISTINGS_LABEL = 'Business Listings' as const
export const ADMIN_BUSINESS_LISTINGS_DESCRIPTION =
  'Review and approve business directory applications.' as const

export default function AdminBusinessListingsCard() {
  return (
    <Card className="mb-10" padding="sm">
      <h2 className="text-display text-lg font-semibold">
        {ADMIN_BUSINESS_LISTINGS_LABEL}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {ADMIN_BUSINESS_LISTINGS_DESCRIPTION}
      </p>
      <Link
        href={ADMIN_BUSINESS_LISTINGS_HREF}
        className="mt-4 inline-block text-sm font-medium text-accent underline"
      >
        {ADMIN_BUSINESS_LISTINGS_LABEL}
      </Link>
    </Card>
  )
}
