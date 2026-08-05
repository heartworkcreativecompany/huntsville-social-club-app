import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export type EventSponsorRecord = {
  id: string
  business_name: string
  contact_email: string | null
  logo_url: string | null
  website_url: string | null
  sort_order: number
}

export type SponsorOption = {
  id: string
  business_name: string
  contact_email: string | null
  logo_url: string | null
  website_url: string | null
}

type DbClient = SupabaseClient<Database>

export function isSponsorshipEligibleEventType(eventType: string | null | undefined): boolean {
  return eventType === 'circle_social' || eventType === 'premium_event'
}

export function normalizeSponsorBusinessName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function sortEventSponsors<T extends { sort_order: number; business_name: string }>(
  sponsors: T[]
): T[] {
  return [...sponsors].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order
    }
    return left.business_name.localeCompare(right.business_name)
  })
}

export async function findSponsorByBusinessName(
  client: DbClient,
  businessName: string
): Promise<SponsorOption | null> {
  const normalized = normalizeSponsorBusinessName(businessName)
  if (!normalized) {
    return null
  }

  const { data } = await client
    .from('sponsors')
    .select('id, business_name, contact_email, logo_url, website_url')
    .ilike('business_name', normalized)
    .limit(25)

  const match = (data ?? []).find(
    (row) =>
      normalizeSponsorBusinessName(row.business_name).toLowerCase() ===
      normalized.toLowerCase()
  )

  return match ?? null
}

export async function findOrCreateSponsor(
  client: DbClient,
  input: {
    businessName: string
    contactEmail?: string | null
    logoUrl?: string | null
    websiteUrl?: string | null
  }
): Promise<{ sponsor: SponsorOption } | { error: string }> {
  const businessName = normalizeSponsorBusinessName(input.businessName)
  if (!businessName) {
    return { error: 'Business name is required.' }
  }

  const existing = await findSponsorByBusinessName(client, businessName)
  if (existing) {
    return { sponsor: existing }
  }

  const { data, error } = await client
    .from('sponsors')
    .insert({
      business_name: businessName,
      contact_email: input.contactEmail?.trim() || null,
      logo_url: input.logoUrl ?? null,
      website_url: input.websiteUrl ?? null,
    })
    .select('id, business_name, contact_email, logo_url, website_url')
    .single()

  if (error || !data) {
    return { error: error?.message ?? 'Could not create sponsor.' }
  }

  return { sponsor: data }
}

export async function attachSponsorToEvent(
  client: DbClient,
  input: {
    eventId: string
    sponsorId: string
    sortOrder?: number
  }
): Promise<{ error?: string }> {
  const sortOrder = input.sortOrder ?? 0

  const { data: existing } = await client
    .from('event_sponsors')
    .select('id, sort_order')
    .eq('event_id', input.eventId)
    .eq('sponsor_id', input.sponsorId)
    .maybeSingle()

  if (existing) {
    if (input.sortOrder != null && existing.sort_order !== sortOrder) {
      const { error } = await client
        .from('event_sponsors')
        .update({ sort_order: sortOrder })
        .eq('id', existing.id)
      if (error) {
        return { error: error.message }
      }
    }
    return {}
  }

  const { error } = await client.from('event_sponsors').insert({
    event_id: input.eventId,
    sponsor_id: input.sponsorId,
    sort_order: sortOrder,
  })

  if (error) {
    return { error: error.message }
  }

  return {}
}

export async function replaceEventSponsors(
  client: DbClient,
  input: {
    eventId: string
    sponsorIds: string[]
  }
): Promise<{ error?: string }> {
  const uniqueIds = [...new Set(input.sponsorIds.filter(Boolean))]

  const { error: deleteError } = await client
    .from('event_sponsors')
    .delete()
    .eq('event_id', input.eventId)

  if (deleteError) {
    return { error: deleteError.message }
  }

  if (uniqueIds.length === 0) {
    return {}
  }

  const rows = uniqueIds.map((sponsorId, index) => ({
    event_id: input.eventId,
    sponsor_id: sponsorId,
    sort_order: index,
  }))

  const { error: insertError } = await client.from('event_sponsors').insert(rows)
  if (insertError) {
    return { error: insertError.message }
  }

  return {}
}

export async function loadEventSponsors(
  client: DbClient,
  eventId: string
): Promise<EventSponsorRecord[]> {
  const { data: links, error: linksError } = await client
    .from('event_sponsors')
    .select('sponsor_id, sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (linksError || !links || links.length === 0) {
    return []
  }

  const sponsorIds = links.map((row) => row.sponsor_id)
  const { data: sponsors, error: sponsorsError } = await client
    .from('sponsors')
    .select('id, business_name, contact_email, logo_url, website_url')
    .in('id', sponsorIds)

  if (sponsorsError || !sponsors) {
    return []
  }

  const byId = new Map(sponsors.map((sponsor) => [sponsor.id, sponsor]))
  const mapped: EventSponsorRecord[] = []

  for (const link of links) {
    const sponsor = byId.get(link.sponsor_id)
    if (!sponsor) {
      continue
    }
    mapped.push({
      id: sponsor.id,
      business_name: sponsor.business_name,
      contact_email: sponsor.contact_email,
      logo_url: sponsor.logo_url,
      website_url: sponsor.website_url,
      sort_order: link.sort_order,
    })
  }

  return sortEventSponsors(mapped)
}

export async function listSponsorsForAdmin(
  client: DbClient
): Promise<SponsorOption[]> {
  const { data } = await client
    .from('sponsors')
    .select('id, business_name, contact_email, logo_url, website_url')
    .order('business_name', { ascending: true })

  return data ?? []
}

export async function syncSponsorshipPurchaseToEventSponsors(
  client: DbClient,
  input: {
    eventId: string
    businessName: string
    contactEmail?: string | null
    logoUrl?: string | null
    sortOrder?: number
  }
): Promise<{ sponsorId: string } | { error: string }> {
  const created = await findOrCreateSponsor(client, {
    businessName: input.businessName,
    contactEmail: input.contactEmail,
    logoUrl: input.logoUrl,
  })

  if ('error' in created) {
    return created
  }

  const nextSortOrder =
    input.sortOrder ??
    (await nextEventSponsorSortOrder(client, input.eventId))

  const attached = await attachSponsorToEvent(client, {
    eventId: input.eventId,
    sponsorId: created.sponsor.id,
    sortOrder: nextSortOrder,
  })

  if (attached.error) {
    return { error: attached.error }
  }

  return { sponsorId: created.sponsor.id }
}

async function nextEventSponsorSortOrder(
  client: DbClient,
  eventId: string
): Promise<number> {
  const { data } = await client
    .from('event_sponsors')
    .select('sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.sort_order ?? -1) + 1
}
