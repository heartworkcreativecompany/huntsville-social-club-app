'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'

async function requireAdmin() {
  const viewer = await getViewer()
  if (!viewer || viewer.role !== 'admin') {
    return { error: 'Admin access required.' as const }
  }
  return { viewer, supabase: await createClient() }
}

export async function approvePendingEvent(eventId: string) {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const { error } = await auth.supabase
    .from('events')
    .update({ status: 'published' })
    .eq('id', eventId)
    .eq('status', 'pending_approval')

  if (error) return { error: error.message }

  revalidatePath('/events')
  revalidatePath('/admin/events')
  revalidatePath(`/events/${eventId}`)
  return { success: true as const }
}

export async function rejectPendingEvent(eventId: string) {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const { error } = await auth.supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId)
    .eq('status', 'pending_approval')

  if (error) return { error: error.message }

  revalidatePath('/events')
  revalidatePath('/admin/events')
  return { success: true as const }
}

export async function approveEventSponsorship(sponsorshipId: string) {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const { data: sponsorship, error } = await auth.supabase
    .from('event_sponsorships')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sponsorshipId)
    .in('status', ['paid', 'approved'])
    .select('id, event_id, business_name, contact_email, logo_url, sponsor_id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!sponsorship) return { error: 'Sponsorship not found.' }

  const { syncSponsorshipPurchaseToEventSponsors } = await import(
    '@/lib/event-sponsors'
  )
  const synced = await syncSponsorshipPurchaseToEventSponsors(auth.supabase, {
    eventId: sponsorship.event_id,
    businessName: sponsorship.business_name,
    contactEmail: sponsorship.contact_email,
    logoUrl: sponsorship.logo_url,
  })

  if ('sponsorId' in synced && sponsorship.sponsor_id !== synced.sponsorId) {
    await auth.supabase
      .from('event_sponsorships')
      .update({
        sponsor_id: synced.sponsorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sponsorship.id)
  }

  revalidatePath('/admin/events')
  revalidatePath(`/events/${sponsorship.event_id}`)
  return { success: true as const }
}
