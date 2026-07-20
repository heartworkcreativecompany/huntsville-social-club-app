import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadProfileAccountEmails } from '@/lib/load-profile-account-emails'
import { memberDisplayName } from '@/lib/members-discovery'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import {
  conversationNotificationHref,
  createMemberNotification,
} from '@/lib/member-notifications'
import {
  sendCuratedIntroDeclinedEmail,
  sendCuratedIntroMatchedEmail,
  sendCuratedIntroMatchedTargetEmail,
} from '@/lib/transactional-email'
import type {
  CuratedIntroDeclineResult,
  CuratedIntroMatchResult,
} from '@/lib/curated-intro-admin'

type ProfileRow = {
  id: string
  full_name: string | null
}

async function loadProfiles(
  supabase: SupabaseClient<Database>,
  ids: string[]
): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>()
  if (ids.length === 0) return map

  const { data } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('id, full_name')
    .in('id', ids)

  for (const profile of data ?? []) {
    map.set(profile.id, profile)
  }

  return map
}

function displayName(profile: ProfileRow | undefined): string {
  if (!profile) return 'Member'
  return memberDisplayName({
    id: profile.id,
    full_name: profile.full_name,
    contactEmail: null,
    role: null,
    created_at: null,
    membership_intent: null,
    verified_at: null,
    membership_status: null,
    photos: [],
    location_area: null,
    discovery_intent: null,
    location_city: null,
    location_zip: null,
    birth_year: null,
    discovery_interests: [],
    discovery_industry: null,
    public_intents: [],
    verification_state: {},
    membership_tier: 'member',
    vendor_reviewed_badge: false,
  } as Parameters<typeof memberDisplayName>[0])
}

export async function notifyCuratedIntroMatched(
  supabase: SupabaseClient<Database>,
  result: CuratedIntroMatchResult
) {
  const profiles = await loadProfiles(supabase, [
    result.requesterId,
    result.targetMemberId,
  ])
  const accountEmails = await loadProfileAccountEmails([
    result.requesterId,
    result.targetMemberId,
  ])
  const requester = profiles.get(result.requesterId)
  const target = profiles.get(result.targetMemberId)
  const requesterEmail = accountEmails.get(result.requesterId)
  const targetEmail = accountEmails.get(result.targetMemberId)

  if (requesterEmail) {
    void sendCuratedIntroMatchedEmail({
      to: requesterEmail,
      otherMemberName: displayName(target),
      conversationId: result.conversationId,
    })
  }

  void createMemberNotification(supabase, {
    userId: result.requesterId,
    type: 'curated_intro_matched',
    href: conversationNotificationHref(result.conversationId),
    metadata: {
      conversationId: result.conversationId,
      targetMemberId: result.targetMemberId,
    },
  })

  if (targetEmail) {
    void sendCuratedIntroMatchedTargetEmail({
      to: targetEmail,
      otherMemberName: displayName(requester),
      conversationId: result.conversationId,
    })
  }
}

export async function notifyCuratedIntroDeclined(
  supabase: SupabaseClient<Database>,
  result: CuratedIntroDeclineResult
) {
  const profileIds = [result.requesterId]
  if (result.targetMemberId) {
    profileIds.push(result.targetMemberId)
  }
  const profiles = await loadProfiles(supabase, profileIds)
  const accountEmails = await loadProfileAccountEmails(profileIds)
  const requester = profiles.get(result.requesterId)
  const requesterEmail = accountEmails.get(result.requesterId)

  if (requesterEmail) {
    void sendCuratedIntroDeclinedEmail({
      to: requesterEmail,
      otherMemberName: result.targetMemberId
        ? displayName(profiles.get(result.targetMemberId))
        : 'your match',
    })
  }

  void createMemberNotification(supabase, {
    userId: result.requesterId,
    type: 'curated_intro_declined',
    metadata: {
      introRequestId: result.introRequestId,
      targetMemberId: result.targetMemberId,
    },
  })
}
