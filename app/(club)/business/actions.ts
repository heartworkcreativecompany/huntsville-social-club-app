'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { getViewer } from '@/lib/viewer'

export async function submitBusinessListingApplication(input: {
  businessName: string
  description: string
  industry: string
  websiteUrl?: string
  contactEmail?: string
  phone?: string
  city?: string
  clubOffer?: string
  headerImageUrl?: string
}) {
  const viewer = await getViewer()
  if (!viewer?.canAccessApp) {
    return { error: 'Membership approval is required.' }
  }

  const { entitlements } = await loadMemberEntitlementsForViewer()
  if (!entitlements?.canApplyBusinessListing) {
    return {
      error: 'Only Elite Circle members can apply for a Business Directory listing.',
    }
  }

  const businessName = input.businessName.trim()
  const industry = input.industry.trim()
  if (!businessName || !industry) {
    return { error: 'Business name and industry are required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('business_listings').insert({
    owner_id: viewer.userId,
    business_name: businessName,
    description: input.description.trim(),
    industry,
    category: '',
    website_url: input.websiteUrl?.trim() || null,
    contact_email: input.contactEmail?.trim() || viewer.email,
    phone: input.phone?.trim() || null,
    city: input.city?.trim() || null,
    club_offer: input.clubOffer?.trim() || '',
    header_image_url: input.headerImageUrl?.trim() || null,
    status: 'pending',
    submitted_at: new Date().toISOString(),
  })

  if (error) return { error: error.message }

  revalidatePath('/business')
  revalidatePath('/admin/business-listings')
  return { success: true as const }
}

export async function reviewBusinessListing(
  listingId: string,
  status: 'approved' | 'rejected',
  adminNotes?: string
) {
  const viewer = await getViewer()
  if (!viewer || viewer.role !== 'admin') {
    return { error: 'Admin access required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('business_listings')
    .update({
      status,
      admin_notes: adminNotes?.trim() || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)

  if (error) return { error: error.message }

  revalidatePath('/business')
  revalidatePath('/admin/business-listings')
  return { success: true as const }
}
