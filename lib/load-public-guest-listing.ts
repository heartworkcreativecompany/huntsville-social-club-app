import { createAdminClient } from '@/lib/supabase/admin'

/** Confirmed on the server, then only the question fields are returned. */
export const PUBLIC_GUEST_LISTING_SELECT =
  'status, listed_publicly, rsvp_question, rsvp_question_required, general_rsvp_opens_at'

export type PublicGuestListing = {
  rsvpQuestion: string | null
  rsvpQuestionRequired: boolean
  generalRsvpOpen: boolean
}

function generalRsvpIsOpen(
  generalRsvpOpensAt: string | null,
  now: Date
): boolean {
  if (generalRsvpOpensAt == null) return true
  const opensAt = new Date(generalRsvpOpensAt).getTime()
  if (Number.isNaN(opensAt)) return false
  return opensAt <= now.getTime()
}

export async function loadPublicGuestListingFields(
  eventId: string,
  now = new Date()
): Promise<PublicGuestListing | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data, error } = await admin
    .from('events')
    .select(PUBLIC_GUEST_LISTING_SELECT)
    .eq('id', eventId)
    .maybeSingle()

  if (error || !data) return null
  if (data.status !== 'published' || data.listed_publicly !== true) return null

  const question = data.rsvp_question?.trim() ?? ''
  return {
    rsvpQuestion: question.length > 0 ? question : null,
    rsvpQuestionRequired: data.rsvp_question_required === true,
    generalRsvpOpen: generalRsvpIsOpen(data.general_rsvp_opens_at, now),
  }
}
