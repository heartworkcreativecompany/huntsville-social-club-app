import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/page-header'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { getViewer } from '@/lib/viewer'
import AdminBusinessListingReview from '@/components/admin/admin-business-listing-review'
import { formatBusinessListingIndustryLabel } from '@/lib/business-listing-industries'

export default async function AdminBusinessListingsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (viewer.role !== 'admin') redirect('/members')

  const supabase = await createClient()
  const { data: listings } = await supabase
    .from('business_listings')
    .select(
      'id, business_name, description, industry, website_url, city, phone, club_offer, header_image_url, status, submitted_at, owner_id'
    )
    .in('status', ['pending', 'approved', 'rejected'])
    .order('submitted_at', { ascending: true, nullsFirst: false })

  const pending = listings?.filter((row) => row.status === 'pending') ?? []

  return (
    <>
      <Link
        href="/admin/applications"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Admin
      </Link>
      <PageHeader
        eyebrow="Admin"
        title="Business Directory"
        description="Approve or reject Elite Circle listing applications."
      />

      {!pending.length ? (
        <EmptyState
          title="No pending listings"
          description="Elite applications awaiting review will appear here."
        />
      ) : (
        <div className="grid gap-4">
          {pending.map((listing) => (
            <Card key={listing.id} padding="sm">
              <div className="flex gap-3">
                {listing.header_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.header_image_url}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <h3 className="text-display text-lg font-medium">
                    {listing.business_name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBusinessListingIndustryLabel(listing.industry)}
                    {listing.city ? ` · ${listing.city}` : ''}
                  </p>
                  {listing.phone ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Contact: {listing.phone}
                    </p>
                  ) : null}
                  {listing.club_offer ? (
                    <p className="mt-1 text-sm text-foreground">
                      Club offer: {listing.club_offer}
                    </p>
                  ) : null}
                  {listing.description ? (
                    <p className="mt-2 text-sm text-foreground">
                      {listing.description}
                    </p>
                  ) : null}
                  {listing.website_url ? (
                    <a
                      href={listing.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-accent underline"
                    >
                      Website
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mt-4">
                <AdminBusinessListingReview listingId={listing.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
