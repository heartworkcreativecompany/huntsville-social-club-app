import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/ui/empty-state'
import BusinessListingDetail from '@/components/business/business-listing-detail'
import { getViewer } from '@/lib/viewer'
import {
  BUSINESS_DIRECTORY_PATH,
  PUBLIC_BUSINESS_LISTING_SELECT,
  isApprovedBusinessListing,
  parseBusinessListingDetailSlug,
  resolveApprovedPublicBusinessListing,
  type PublicBusinessListing,
} from '@/lib/business-listing-directory'

type PageProps = {
  params: Promise<{ slug: string }>
}

function ListingNotFound() {
  return (
    <>
      <Link
        href={BUSINESS_DIRECTORY_PATH}
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to Business Directory
      </Link>
      <EmptyState
        title="Listing not found"
        description="This business listing may have been removed or is no longer available."
      />
    </>
  )
}

export default async function BusinessListingDetailPage({ params }: PageProps) {
  const { slug } = await params
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (!viewer.canAccessApp) redirect('/application')

  const listingId = parseBusinessListingDetailSlug(slug)
  if (!listingId) {
    return <ListingNotFound />
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('business_listings')
    .select(PUBLIC_BUSINESS_LISTING_SELECT)
    .eq('id', listingId)
    .eq('status', 'approved')
    .maybeSingle()

  const listing = resolveApprovedPublicBusinessListing(
    listingId,
    (data as PublicBusinessListing | null) ?? null
  )

  if (!listing || !isApprovedBusinessListing(listing)) {
    return <ListingNotFound />
  }

  return <BusinessListingDetail listing={listing} />
}
