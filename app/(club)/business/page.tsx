import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/page-header'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import BusinessDirectoryCard from '@/components/business/business-directory-card'
import { getViewer } from '@/lib/viewer'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import {
  BUSINESS_DIRECTORY_GRID_CLASS,
  groupPublicBusinessListingsByIndustry,
} from '@/lib/business-listing-directory'
import { FEATURE_GATE_COPY } from '@/lib/membership-pricing-copy'

export default async function BusinessDirectoryPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (!viewer.canAccessApp) redirect('/application')

  const supabase = await createClient()
  const { entitlements } = await loadMemberEntitlementsForViewer()

  const { data: listings } = await supabase
    .from('business_listings')
    .select(
      'id, business_name, description, industry, website_url, city, club_offer, header_image_url, status'
    )
    .eq('status', 'approved')
    .order('business_name', { ascending: true })

  const industrySections = groupPublicBusinessListingsByIndustry(listings ?? [])

  return (
    <>
      <PageHeader
        eyebrow="Local"
        title="Business Directory"
        description="Browse approved local businesses by industry. Elite Circle members can apply for a listing."
        actions={
          entitlements?.canApplyBusinessListing ? (
            <Link href="/business/apply" className={buttonPrimaryClassName}>
              Apply for listing
            </Link>
          ) : (
            <Link href="/upgrade" className="text-sm font-medium text-accent underline">
              Elite required to apply
            </Link>
          )
        }
      />

      {!entitlements?.canApplyBusinessListing ? (
        <Card className="mb-8 border-border" padding="sm">
          <p className="text-sm text-muted-foreground">
            {FEATURE_GATE_COPY.business_directory_apply.inline} All members can
            browse approved listings.
          </p>
        </Card>
      ) : null}

      {!listings?.length ? (
        <EmptyState
          title="No listings yet"
          description="Approved business listings will appear here by industry."
        />
      ) : (
        <div className="grid gap-8">
          {industrySections.map(({ industry, listings: group }) => (
            <section key={industry}>
              <h2 className="text-display mb-3 text-xl font-medium">{industry}</h2>
              <ul className={BUSINESS_DIRECTORY_GRID_CLASS}>
                {group.map((listing) => (
                  <li key={listing.id} className="min-w-0">
                    <BusinessDirectoryCard listing={listing} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
