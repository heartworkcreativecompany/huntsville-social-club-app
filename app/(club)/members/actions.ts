'use server'

import { revalidatePath } from 'next/cache'
import type { ApplicationPhoto } from '@/lib/application'
import { INTEREST_MIN, PHOTO_MIN_COUNT } from '@/lib/application-form-content'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MemberPublicIntentValue } from '@/lib/member-public-intent'
import { approvalGatesAfterRevisionSubmit } from '@/lib/profile-revision-approval'
import { cleanupProfilePhotoStorageSafe } from '@/lib/profile-photo-cleanup'
import {
  livePhotoStoragePaths,
  supersededPendingRevisionCleanupCandidates,
} from '@/lib/profile-photo-cleanup-plan'
import { storagePathsFromPhotos } from '@/lib/profile-photo-references'
import {
  liveProfileRevisionSnapshot,
  photosEqual,
  type ProfilePendingRevision,
} from '@/lib/profile-revision'
import { sendProfileRevisionSubmittedEmail } from '@/lib/transactional-email'

function interestsKey(interests: string[]): string {
  return [...interests].map((item) => item.trim()).filter(Boolean).sort().join(',')
}

export async function updateMemberProfile(input: {
  displayName: string
  bio: string
  locationArea: string
  memberPublicIntents: MemberPublicIntentValue[]
  interests: string[]
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
  const interestsChanged =
    interestsKey(live.interests) !== interestsKey(input.interests)

  const revision: ProfilePendingRevision = {
    displayName: input.displayName.trim(),
    bio: input.bio.trim(),
    locationArea: input.locationArea.trim(),
    memberPublicIntents: input.memberPublicIntents,
    submittedAt: new Date().toISOString(),
    ...(photosChanged ? { photos: input.photos } : {}),
    ...(interestsChanged ? { interests: input.interests } : {}),
  }

  const hasChanges =
    revision.displayName !== live.displayName.trim() ||
    revision.bio !== live.bio.trim() ||
    revision.locationArea !== live.locationArea.trim() ||
    [...revision.memberPublicIntents].sort().join(',') !==
      [...live.memberPublicIntents].sort().join(',') ||
    photosChanged ||
    interestsChanged

  if (!hasChanges) {
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
