import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadProfileAccountEmails } from '@/lib/load-profile-account-emails'
import { memberDisplayName } from '@/lib/members-discovery'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import {
  conversationNotificationHref,
  createMemberNotification,
} from '@/lib/member-notifications'
import { loadMemberEntitlementsForUserId } from '@/lib/load-member-entitlements'
import { canUseMessaging } from '@/lib/membership-entitlements'
import {
  sendCuratedIntroDeclinedEmail,
  sendCuratedIntroMatchedEmail,
  sendCuratedIntroMatchedTargetEmail,
} from '@/lib/transactional-email'
import type { CuratedIntroEmailAudience } from '@/lib/curated-intro-email'
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
  return memberDisplayName(profile)
}

export async function recipientHasPaidMessaging(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const entitlements = await loadMemberEntitlementsForUserId(userId, supabase)
  return Boolean(entitlements && canUseMessaging(entitlements))
}

async function sendApprovedIntroEmail(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string
    email: string | null | undefined
    otherMemberName: string
    conversationId: string
    audience: CuratedIntroEmailAudience
  }
) {
  const entitled = await recipientHasPaidMessaging(supabase, input.userId)
  if (input.email) {
    const payload = {
      to: input.email,
      otherMemberName: input.otherMemberName,
      conversationId: input.conversationId,
      recipientEntitled: entitled,
    }
    if (input.audience === 'requester') {
      void sendCuratedIntroMatchedEmail(payload)
    } else {
      void sendCuratedIntroMatchedTargetEmail(payload)
    }
  }

  void createMemberNotification(supabase, {
    userId: input.userId,
    type: 'curated_intro_matched',
    href: entitled
      ? conversationNotificationHref(input.conversationId)
      : '/upgrade',
    title: entitled ? undefined : 'Curated intro approved',
    body: entitled
      ? undefined
      : 'Your curated intro was approved. An active paid membership is required to message.',
    metadata: entitled
      ? { conversationId: input.conversationId }
      : { membershipRequired: true },
  })
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

  await sendApprovedIntroEmail(supabase, {
    userId: result.requesterId,
    email: requesterEmail,
    otherMemberName: displayName(target),
    conversationId: result.conversationId,
    audience: 'requester',
  })

  await sendApprovedIntroEmail(supabase, {
    userId: result.targetMemberId,
    email: targetEmail,
    otherMemberName: displayName(requester),
    conversationId: result.conversationId,
    audience: 'target',
  })
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
