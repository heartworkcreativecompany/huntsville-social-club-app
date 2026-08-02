import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/page-header'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { getViewer } from '@/lib/viewer'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import {
  compareBusinessListingIndustries,
  formatBusinessListingIndustryLabel,
} from '@/lib/business-listing-industries'
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
      'id, business_name, description, industry, website_url, city, phone, club_offer, header_image_url, status'
    )
    .eq('status', 'approved')
    .order('business_name', { ascending: true })

  const byIndustry = new Map<string, NonNullable<typeof listings>>()
  for (const listing of listings ?? []) {
    const key = formatBusinessListingIndustryLabel(listing.industry)
    const group = byIndustry.get(key) ?? []
    group.push(listing)
    byIndustry.set(key, group)
  }

  const industrySections = [...byIndustry.entries()].sort(([a], [b]) => {
    const sampleA = byIndustry.get(a)?.[0]?.industry
    const sampleB = byIndustry.get(b)?.[0]?.industry
    return compareBusinessListingIndustries(sampleA, sampleB)
  })

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
          {industrySections.map(([industry, group]) => (
            <section key={industry}>
              <h2 className="text-display mb-3 text-xl font-medium">{industry}</h2>
              <div className="grid gap-3">
                {(group ?? []).map((listing) => (
                  <Card key={listing.id} padding="sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 gap-3">
                        {listing.header_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={listing.header_image_url}
                            alt=""
                            className="h-16 w-16 shrink-0 rounded-md object-cover"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <h3 className="font-medium text-foreground">
                            {listing.business_name}
                          </h3>
                          {listing.city ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {listing.city}
                            </p>
                          ) : null}
                          {listing.description ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {listing.description}
                            </p>
                          ) : null}
                          {listing.club_offer ? (
                            <p className="mt-2 text-sm text-foreground">
                              Club offer: {listing.club_offer}
                            </p>
                          ) : null}
                          {listing.phone ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {listing.phone}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {listing.website_url ? (
                        <a
                          href={listing.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-accent underline"
                        >
                          Website
                        </a>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
