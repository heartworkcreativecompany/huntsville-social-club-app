import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadMemberEntitlementsForUserId } from '@/lib/load-member-entitlements'
import { canUseMessaging } from '@/lib/membership-entitlements'
import type {
  CuratedIntroDeclineResult,
  CuratedIntroMatchResult,
} from '@/lib/curated-intro-admin'

export async function recipientHasPaidMessaging(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const entitlements = await loadMemberEntitlementsForUserId(userId, supabase)
  return Boolean(entitlements && canUseMessaging(entitlements))
}

export async function notifyCuratedIntroMatched(
  supabase: SupabaseClient<Database>,
  result: CuratedIntroMatchResult
): Promise<void> {
  void supabase
  void result
}

export async function notifyCuratedIntroDeclined(
  supabase: SupabaseClient<Database>,
  result: CuratedIntroDeclineResult
): Promise<void> {
  void supabase
  void result
}
