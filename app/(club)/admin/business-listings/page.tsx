import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/page-header'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { getViewer } from '@/lib/viewer'
import AdminBusinessListingReview from '@/components/admin/admin-business-listing-review'

export default async function AdminBusinessListingsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (viewer.role !== 'admin') redirect('/members')

  const supabase = await createClient()
  const { data: listings } = await supabase
    .from('business_listings')
    .select(
      'id, business_name, description, industry, category, website_url, city, status, submitted_at, owner_id'
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
              <h3 className="text-display text-lg font-medium">
                {listing.business_name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {listing.industry} · {listing.category}
                {listing.city ? ` · ${listing.city}` : ''}
              </p>
              {listing.description ? (
                <p className="mt-2 text-sm text-foreground">{listing.description}</p>
              ) : null}
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
