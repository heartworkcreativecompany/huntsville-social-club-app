'use server'

import { revalidatePath } from 'next/cache'
import type { ApplicationPhoto } from '@/lib/application'
import { INTEREST_MIN, PHOTO_MIN_COUNT } from '@/lib/application-form-content'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MemberPublicIntentValue } from '@/lib/member-public-intent'
import { sanitizeConnectionsOpenToForStorage } from '@/lib/member-public-intent'
import { approvalGatesAfterRevisionSubmit } from '@/lib/profile-revision-approval'
import { cleanupProfilePhotoStorageSafe } from '@/lib/profile-photo-cleanup'
import {
  livePhotoStoragePaths,
  supersededPendingRevisionCleanupCandidates,
} from '@/lib/profile-photo-cleanup-plan'
import { storagePathsFromPhotos } from '@/lib/profile-photo-references'
import {
  buildProfileRevisionDiff,
  liveProfileRevisionSnapshot,
  photosEqual,
  type ProfilePendingRevision,
} from '@/lib/profile-revision'
import { sendProfileRevisionSubmittedEmail } from '@/lib/transactional-email'

function listKey(values: string[]): string {
  return [...values].map((item) => item.trim()).filter(Boolean).sort().join(',')
}

export async function updateMemberProfile(input: {
  displayName: string
  bio: string
  locationArea: string
  memberPublicIntents: MemberPublicIntentValue[]
  interests: string[]
  occupation: string
  industry: string
  lifestyleTags: string[]
  eventInterests: string[]
  socialVibe: string
  connectionsOpenTo: string[]
  perfectWeekend: string
  favoriteLocalActivities: string
  icebreaker: string
  photos: ApplicationPhoto[]
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'application_status, application_draft, full_name, membership_intent, location_area, connections_open_to, connection_intents, discovery_intent, discovery_interests, approval_gates, profile_revision_status, profile_pending_revision'
    )
    .eq('id', user.id)
    .single()

  if (profile?.application_status !== 'approved') {
    return {
      error:
        'Profile edits after approval use the revision queue. Complete your application first.',
    }
  }

  if (input.photos.length < PHOTO_MIN_COUNT) {
    return {
      error: `Please keep at least ${PHOTO_MIN_COUNT} photos on your profile.`,
    }
  }

  if (input.interests.length < INTEREST_MIN) {
    return {
      error: `Please select at least ${INTEREST_MIN} interests.`,
    }
  }

  if (input.memberPublicIntents.length < 1) {
    return {
      error: 'Select at least one kind of connection you are looking for.',
    }
  }

  const live = liveProfileRevisionSnapshot({
    full_name: profile.full_name,
    membership_intent: profile.membership_intent,
    location_area: profile.location_area,
    application_draft: profile.application_draft,
    connections_open_to: profile.connections_open_to,
    connection_intents: profile.connection_intents,
    discovery_intent: profile.discovery_intent,
    discovery_interests: profile.discovery_interests,
  })

  const photosChanged = !photosEqual(live.photos, input.photos)
  const interestsChanged = listKey(live.interests) !== listKey(input.interests)
  const occupation = input.occupation.trim()
  const industry = input.industry.trim()
  const socialVibe = input.socialVibe.trim()
  const perfectWeekend = input.perfectWeekend.trim()
  const favoriteLocalActivities = input.favoriteLocalActivities.trim()
  const icebreaker = input.icebreaker.trim()
  const lifestyleTags = input.lifestyleTags.map((item) => item.trim()).filter(Boolean)
  const eventInterests = input.eventInterests
    .map((item) => item.trim())
    .filter(Boolean)
  const connectionsOpenTo = sanitizeConnectionsOpenToForStorage(
    input.connectionsOpenTo,
    input.memberPublicIntents
  )

  const revision: ProfilePendingRevision = {
    displayName: input.displayName.trim(),
    bio: input.bio.trim(),
    locationArea: input.locationArea.trim(),
    memberPublicIntents: input.memberPublicIntents,
    submittedAt: new Date().toISOString(),
    ...(photosChanged ? { photos: input.photos } : {}),
    ...(interestsChanged ? { interests: input.interests } : {}),
    ...(occupation !== live.occupation ? { occupation } : {}),
    ...(industry !== live.industry ? { industry } : {}),
    ...(listKey(lifestyleTags) !== listKey(live.lifestyleTags)
      ? { lifestyleTags }
      : {}),
    ...(listKey(eventInterests) !== listKey(live.eventInterests)
      ? { eventInterests }
      : {}),
    ...(socialVibe !== live.socialVibe ? { socialVibe } : {}),
    ...(listKey(connectionsOpenTo) !== listKey(live.connectionsOpenTo)
      ? { connectionsOpenTo }
      : {}),
    ...(perfectWeekend !== live.perfectWeekend ? { perfectWeekend } : {}),
    ...(favoriteLocalActivities !== live.favoriteLocalActivities
      ? { favoriteLocalActivities }
      : {}),
    ...(icebreaker !== live.icebreaker ? { icebreaker } : {}),
  }

  const diff = buildProfileRevisionDiff(live, revision)
  if (diff.changedFields.length === 0) {
    return { error: 'No changes to submit.' }
  }

  const approval_gates = approvalGatesAfterRevisionSubmit(
    profile.approval_gates,
    live.photos,
    input.photos
  )

  const { error } = await supabase
    .from('profiles')
    .update({
      profile_pending_revision: revision,
      profile_revision_status: 'pending',
      profile_revision_submitted_at: revision.submittedAt,
      profile_revision_reviewed_at: null,
      profile_revision_admin_notes: null,
      approval_gates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  const admin = createAdminClient()
  const nextPendingPhotos = photosChanged ? input.photos : undefined
  await cleanupProfilePhotoStorageSafe(admin, {
    userId: user.id,
    candidatePaths: supersededPendingRevisionCleanupCandidates({
      applicationDraft: profile.application_draft,
      previousProfilePendingRevision: profile.profile_pending_revision,
      nextPendingPhotos,
    }),
    protectedPaths: [
      ...livePhotoStoragePaths(profile.application_draft),
      ...storagePathsFromPhotos(nextPendingPhotos ?? []),
    ],
    context: 'supersede_pending_revision',
  })

  const notifyEmail = user.email
  if (notifyEmail) {
    void sendProfileRevisionSubmittedEmail(notifyEmail)
  }

  revalidatePath('/members')
  revalidatePath('/profile')
  revalidatePath(`/members/${user.id}`)
  revalidatePath('/home')
  revalidatePath('/admin/profile-revisions')

  return { success: true as const, pending: true as const }
}
