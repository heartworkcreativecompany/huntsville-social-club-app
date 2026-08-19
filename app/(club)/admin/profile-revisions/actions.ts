'use server'

import { revalidatePath } from 'next/cache'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import { liveProfileColumnsFromRevision } from '@/lib/apply-profile-revision'
import { runCompatibilityConnectionsLifecycle } from '@/lib/compatibility/sync-server'
import { createMemberNotification } from '@/lib/member-notifications'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import { cleanupProfilePhotoStorageSafe } from '@/lib/profile-photo-cleanup'
import {
  approveRevisionPhotoCleanupCandidates,
  livePhotoStoragePaths,
  rejectRevisionPhotoCleanupCandidates,
} from '@/lib/profile-photo-cleanup-plan'
import {
  approvalGatesAfterRevisionApprove,
  verificationStateAfterRevisionApprove,
} from '@/lib/profile-revision-approval'
import { storagePathsFromPhotos } from '@/lib/profile-photo-references'
import { appendProfileRevisionHistory } from '@/lib/profile-revision-history'
import {
  buildProfileRevisionDiff,
  liveProfileRevisionSnapshot,
  parseProfilePendingRevision,
  profileRevisionStatusFromDb,
} from '@/lib/profile-revision'
import {
  sendProfileRevisionApprovedEmail,
  sendProfileRevisionRejectedEmail,
} from '@/lib/transactional-email'
import { syncAuthDisplayNameBestEffort } from '@/lib/sync-auth-display-name'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.', supabase: null }
  }

  const { data: profile } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: 'Administrator access required.', supabase: null }
  }

  return { error: null, supabase }
}

export async function approveProfileRevision(
  memberId: string,
  adminNotes?: string
) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const admin = requireAdminClient()
  const { data: member } = await admin
    .from('profiles')
    .select(
      'email, full_name, membership_intent, location_area, discovery_interests, application_draft, connections_open_to, connection_intents, approval_gates, verification_state, profile_pending_revision, profile_revision_status, profile_revision_history'
    )
    .eq('id', memberId)
    .single()

  const pending = parseProfilePendingRevision(member?.profile_pending_revision)
  if (
    !pending ||
    profileRevisionStatusFromDb(member?.profile_revision_status) !== 'pending'
  ) {
    return { error: 'No pending profile revision for this member.' }
  }

  const previousIntents = member?.connection_intents ?? []
  const livePhotos = photosFromApplicationDraft(member?.application_draft)
  const liveSnapshot = liveProfileRevisionSnapshot({
    full_name: member?.full_name ?? null,
    membership_intent: member?.membership_intent ?? null,
    location_area: member?.location_area ?? null,
    application_draft: member?.application_draft,
    connections_open_to: member?.connections_open_to,
    connection_intents: member?.connection_intents,
    discovery_interests: member?.discovery_interests,
  })
  const diff = buildProfileRevisionDiff(liveSnapshot, pending)
  const reviewedAt = new Date().toISOString()

  const liveColumns = liveProfileColumnsFromRevision(
    member?.application_draft,
    pending
  )
  const approval_gates = approvalGatesAfterRevisionApprove(
    member?.approval_gates,
    pending,
    livePhotos
  )
  const verification_state = verificationStateAfterRevisionApprove(
    approval_gates,
    member?.verification_state
  )

  const profile_revision_history = appendProfileRevisionHistory(
    member?.profile_revision_history,
    {
      status: 'approved',
      submittedAt: pending.submittedAt,
      reviewedAt,
      adminNotes: adminNotes?.trim() || null,
      changedFields: diff.changedFields,
      revision: pending,
    }
  )

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      ...liveColumns,
      approval_gates,
      verification_state,
      profile_pending_revision: null,
      profile_revision_status: 'none',
      profile_revision_reviewed_at: reviewedAt,
      profile_revision_admin_notes: adminNotes?.trim() || null,
      profile_revision_history,
      updated_at: reviewedAt,
    })
    .eq('id', memberId)

  if (error) {
    return { error: error.message }
  }

  await syncAuthDisplayNameBestEffort({
    userId: memberId,
    publicFacingName: liveColumns.full_name,
  })

  const cleanupCandidates = approveRevisionPhotoCleanupCandidates({
    applicationDraft: member?.application_draft,
    profilePendingRevision: member?.profile_pending_revision,
  })
  const protectedPaths =
    pending.photos !== undefined
      ? storagePathsFromPhotos(pending.photos)
      : livePhotoStoragePaths(member?.application_draft)

  const serviceAdmin = requireAdminClient()
  await cleanupProfilePhotoStorageSafe(serviceAdmin, {
    userId: memberId,
    candidatePaths: cleanupCandidates,
    protectedPaths,
    context: 'approve_profile_revision',
  })

  await runCompatibilityConnectionsLifecycle(
    memberId,
    previousIntents,
    liveColumns.connection_intents
  )

  void createMemberNotification(serviceAdmin, {
    userId: memberId,
    type: 'profile_revision_approved',
  })

  if (member?.email) {
    void sendProfileRevisionApprovedEmail(member.email)
  }

  revalidatePath('/admin/profile-revisions')
  revalidatePath('/profile')
  revalidatePath('/members')
  revalidatePath(`/members/${memberId}`)

  return { success: true as const }
}

export async function rejectProfileRevision(
  memberId: string,
  adminNotes?: string
) {
  const auth = await requireAdmin()
  if (auth.error || !auth.supabase) {
    return { error: auth.error ?? 'Unauthorized' }
  }

  const admin = requireAdminClient()
  const { data: member } = await admin
    .from('profiles')
    .select(
      'email, full_name, membership_intent, location_area, discovery_interests, application_draft, connections_open_to, profile_revision_status, profile_pending_revision, profile_revision_history'
    )
    .eq('id', memberId)
    .single()

  const pending = parseProfilePendingRevision(member?.profile_pending_revision)
  if (
    profileRevisionStatusFromDb(member?.profile_revision_status) !== 'pending' ||
    !pending
  ) {
    return { error: 'No pending profile revision for this member.' }
  }

  const liveSnapshot = liveProfileRevisionSnapshot({
    full_name: member?.full_name ?? null,
    membership_intent: member?.membership_intent ?? null,
    location_area: member?.location_area ?? null,
    application_draft: member?.application_draft,
    connections_open_to: member?.connections_open_to,
    discovery_interests: member?.discovery_interests,
  })
  const diff = buildProfileRevisionDiff(liveSnapshot, pending)
  const reviewedAt = new Date().toISOString()
  const profile_revision_history = appendProfileRevisionHistory(
    member?.profile_revision_history,
    {
      status: 'rejected',
      submittedAt: pending.submittedAt,
      reviewedAt,
      adminNotes: adminNotes?.trim() || null,
      changedFields: diff.changedFields,
      revision: pending,
    }
  )

  const { error } = await auth.supabase
    .from('profiles')
    .update({
      profile_pending_revision: null,
      profile_revision_status: 'rejected',
      profile_revision_reviewed_at: reviewedAt,
      profile_revision_admin_notes: adminNotes?.trim() || null,
      profile_revision_history,
      updated_at: reviewedAt,
    })
    .eq('id', memberId)

  if (error) {
    return { error: error.message }
  }

  await cleanupProfilePhotoStorageSafe(admin, {
    userId: memberId,
    candidatePaths: rejectRevisionPhotoCleanupCandidates({
      applicationDraft: member?.application_draft,
      profilePendingRevision: member?.profile_pending_revision,
    }),
    protectedPaths: livePhotoStoragePaths(member?.application_draft),
    context: 'reject_profile_revision',
  })

  if (member?.email) {
    void sendProfileRevisionRejectedEmail(member.email, adminNotes)
  }

  revalidatePath('/admin/profile-revisions')
  revalidatePath('/profile')

  return { success: true as const }
}
