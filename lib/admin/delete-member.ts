import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { APPLICATION_PHOTOS_BUCKET } from '@/lib/application-photo-storage'
import { logModerationAction } from '@/lib/moderation-actions'
import {
  collectMemberPhotoStoragePaths,
  validateRemoveMemberRequest,
  type RemoveMemberProfile,
} from '@/lib/admin/remove-member-guards'
import {
  parseMembershipBilling,
  type MembershipBilling,
} from '@/lib/membership-systems'
import { getStripe, isStripeConfigured } from '@/lib/stripe/config'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'

export type { RemoveMemberProfile } from '@/lib/admin/remove-member-guards'
export {
  collectMemberPhotoStoragePaths,
  validateRemoveMemberRequest,
} from '@/lib/admin/remove-member-guards'
export {
  isRemoveMemberEmailConfirmation,
  removeMemberConfirmationError,
  removeMemberConfirmationLabel,
} from '@/lib/admin/remove-member-confirmation'

export async function listMemberStorageFolderPaths(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<string[]> {
  const { data, error } = await admin.storage
    .from(APPLICATION_PHOTOS_BUCKET)
    .list(userId, { limit: 200 })

  if (error || !data) {
    return []
  }

  return data
    .filter((item) => item.name && !item.id?.endsWith('/'))
    .map((item) => `${userId}/${item.name}`)
}

export async function deleteMemberStorageObjects(
  admin: SupabaseClient<Database>,
  userId: string,
  referencedPaths: string[]
): Promise<{ deleted: string[]; failed: string[] }> {
  const folderPaths = await listMemberStorageFolderPaths(admin, userId)
  const paths = [...new Set([...referencedPaths, ...folderPaths])]
  const deleted: string[] = []
  const failed: string[] = []

  if (paths.length === 0) {
    return { deleted, failed }
  }

  const { error } = await admin.storage.from(APPLICATION_PHOTOS_BUCKET).remove(paths)

  if (error) {
    return { deleted, failed: paths }
  }

  return { deleted: paths, failed }
}

export async function cancelMemberStripeSubscription(
  billing: MembershipBilling
): Promise<{ cancelled: boolean; error: string | null }> {
  const subscriptionId = billing.stripe_subscription_id?.trim()
  if (!subscriptionId) {
    return { cancelled: false, error: null }
  }

  const cancellable =
    billing.subscription_status === 'active' ||
    billing.subscription_status === 'grace' ||
    billing.subscription_status === 'past_due'

  if (!cancellable) {
    return { cancelled: false, error: null }
  }

  if (!isStripeConfigured()) {
    return {
      cancelled: false,
      error:
        'Stripe is not configured. Cancel the subscription manually before removing this member.',
    }
  }

  try {
    const stripe = getStripe()
    await stripe.subscriptions.cancel(subscriptionId)
    return { cancelled: true, error: null }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to cancel Stripe subscription.'
    return { cancelled: false, error: message }
  }
}

export async function removeMemberAccount(input: {
  actorId: string
  targetUserId: string
  confirmationText: string
  target: RemoveMemberProfile
}): Promise<{ success: true } | { success: false; error: string }> {
  const guard = validateRemoveMemberRequest({
    actorId: input.actorId,
    targetUserId: input.targetUserId,
    confirmationText: input.confirmationText,
    target: input.target,
  })

  if (!guard.allowed) {
    return { success: false, error: guard.error }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      success: false,
      error: 'Admin service is unavailable. Check SUPABASE_SERVICE_ROLE_KEY.',
    }
  }

  const billing = parseMembershipBilling(input.target.membership_billing)
  const stripeResult = await cancelMemberStripeSubscription(billing)
  if (stripeResult.error) {
    return { success: false, error: stripeResult.error }
  }

  const photoPaths = collectMemberPhotoStoragePaths(input.target)
  const storageResult = await deleteMemberStorageObjects(
    admin,
    input.targetUserId,
    photoPaths
  )

  if (storageResult.failed.length > 0) {
    return {
      success: false,
      error:
        'Could not delete all member photo files from storage. The account was not removed.',
    }
  }

  const displayName =
    input.target.full_name?.trim() ||
    input.target.email?.trim() ||
    input.targetUserId

  const auditResult = await logModerationAction(admin, {
    actorId: input.actorId,
    targetMemberId: input.targetUserId,
    actionType: 'member_deleted',
    sourceType: 'profile',
    sourceId: input.targetUserId,
    reason: 'Admin removed member account',
    details: JSON.stringify({
      email: input.target.email,
      full_name: input.target.full_name,
      role: input.target.role,
      stripe_subscription_cancelled: stripeResult.cancelled,
      storage_objects_deleted: storageResult.deleted.length,
    }),
  })

  if (!auditResult.ok) {
    return {
      success: false,
      error: `Could not write moderation audit log: ${auditResult.error}`,
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(
    input.targetUserId
  )

  if (deleteError) {
    return {
      success: false,
      error: deleteError.message || 'Failed to delete auth user.',
    }
  }

  console.info('[admin.remove-member]', {
    actorId: input.actorId,
    targetUserId: input.targetUserId,
    displayName,
    storageDeleted: storageResult.deleted.length,
    stripeCancelled: stripeResult.cancelled,
  })

  return { success: true }
}
