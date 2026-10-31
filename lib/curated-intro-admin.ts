import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export type CuratedIntroMatchResult = {
  introRequestId: string
  conversationId: string
  requesterId: string
  targetMemberId: string
}

export type CuratedIntroDeclineResult = {
  introRequestId: string
  requesterId: string
  targetMemberId: string | null
}

export const STAFF_INTRO_REVIEW_RETIRED =
  'Staff intro review is retired. Existing requests stay unchanged, and members accept or decline message requests themselves.'

export async function matchCuratedIntroRequest(
  supabase: SupabaseClient<Database>,
  introRequestId: string,
  adminNotes?: string
): Promise<
  | { ok: true; result: CuratedIntroMatchResult }
  | { ok: false; error: string }
> {
  void supabase
  void introRequestId
  void adminNotes
  return { ok: false, error: STAFF_INTRO_REVIEW_RETIRED }
}

export async function declineCuratedIntroRequest(
  supabase: SupabaseClient<Database>,
  introRequestId: string,
  adminNotes?: string
): Promise<
  | { ok: true; result: CuratedIntroDeclineResult }
  | { ok: false; error: string }
> {
  void supabase
  void introRequestId
  void adminNotes
  return { ok: false, error: STAFF_INTRO_REVIEW_RETIRED }
}
