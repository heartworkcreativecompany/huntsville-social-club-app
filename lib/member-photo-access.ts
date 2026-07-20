import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'
import { APPLICATION_PHOTOS_BUCKET } from '@/lib/application-photo-storage'
import { isApprovedMember } from '@/lib/application'
import { canAccessMemberFeatures } from '@/lib/membership'
import { getViewer } from '@/lib/viewer'

export const MEMBER_PHOTO_SIGNED_URL_TTL_SECONDS = 3600

export type MemberPhotoSignedUrlResult = {
  url: string | null
  error?: string
  unauthorized?: boolean
}

function isValidMemberPhotoPath(memberId: string, storagePath: string): boolean {
  return (
    storagePath.startsWith(`${memberId}/`) &&
    !storagePath.includes('..') &&
    storagePath.length > memberId.length + 1
  )
}

/** Who may view a member's application photos. */
export async function canViewMemberPhotos(
  memberId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const viewer = await getViewer()
  if (!viewer) {
    return { allowed: false, reason: 'Unauthorized' }
  }

  if (viewer.userId === memberId) {
    return { allowed: true }
  }

  if (viewer.role === 'admin') {
    return { allowed: true }
  }

  const supabase = await createClient()
  const { data: target } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('application_status, role')
    .eq('id', memberId)
    .single()

  if (!target || target.application_status !== 'approved') {
    return { allowed: false, reason: 'Profile not available' }
  }

  const viewerApproved = canAccessMemberFeatures(
    { application_status: viewer.applicationStatus, role: viewer.role },
    viewer.role
  )

  if (
    viewerApproved &&
    isApprovedMember(viewer.applicationStatus, viewer.role)
  ) {
    return { allowed: true }
  }

  return { allowed: false, reason: 'Unauthorized' }
}

export async function createMemberPhotoSignedUrl(
  memberId: string,
  storagePath: string
): Promise<MemberPhotoSignedUrlResult> {
  if (!isValidMemberPhotoPath(memberId, storagePath)) {
    return { url: null, error: 'Invalid photo path' }
  }

  const access = await canViewMemberPhotos(memberId)
  if (!access.allowed) {
    return {
      url: null,
      error: access.reason ?? 'Unauthorized',
      unauthorized: true,
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(APPLICATION_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, MEMBER_PHOTO_SIGNED_URL_TTL_SECONDS)

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('not found') || message.includes('object not found')) {
      return { url: null, error: 'Photo not found' }
    }
    if (
      message.includes('row-level security') ||
      message.includes('not allowed') ||
      message.includes('unauthorized')
    ) {
      return { url: null, error: 'Photo access denied', unauthorized: true }
    }
    return { url: null, error: error.message }
  }

  if (!data?.signedUrl) {
    return { url: null, error: 'Could not load photo' }
  }

  return { url: data.signedUrl }
}
