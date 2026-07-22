import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/page-header'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { getViewer } from '@/lib/viewer'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { buttonPrimaryClassName } from '@/lib/event-labels'
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
      'id, business_name, description, industry, category, website_url, city, status'
    )
    .eq('status', 'approved')
    .order('industry', { ascending: true })
    .order('business_name', { ascending: true })

  const byIndustry = new Map<string, typeof listings>()
  for (const listing of listings ?? []) {
    const key = listing.industry || 'Other'
    const group = byIndustry.get(key) ?? []
    group.push(listing)
    byIndustry.set(key, group)
  }

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
          {[...byIndustry.entries()].map(([industry, group]) => (
            <section key={industry}>
              <h2 className="text-display mb-3 text-xl font-medium">{industry}</h2>
              <div className="grid gap-3">
                {(group ?? []).map((listing) => (
                  <Card key={listing.id} padding="sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-foreground">
                          {listing.business_name}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {listing.category}
                          {listing.city ? ` · ${listing.city}` : ''}
                        </p>
                        {listing.description ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {listing.description}
                          </p>
                        ) : null}
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
