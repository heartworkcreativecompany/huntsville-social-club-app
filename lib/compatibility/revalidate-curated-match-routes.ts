import 'server-only'

import { revalidatePath } from 'next/cache'

export type CuratedMatchRevalidateOptions = {
  profile?: boolean
  matches?: boolean
  compatibility?: boolean
  messages?: boolean
  adminCuratedIntros?: boolean
  adminCuratedMatches?: boolean
  adminMessageReports?: boolean
  conversationId?: string | null
  memberId?: string | null
}

const DEFAULT_MEMBER_ROUTES: Required<
  Pick<
    CuratedMatchRevalidateOptions,
    'profile' | 'matches' | 'compatibility' | 'messages'
  >
> = {
  profile: true,
  matches: true,
  compatibility: true,
  messages: false,
}

/** Bust cached member/admin curated-match surfaces after lifecycle mutations. */
export function revalidateCuratedMatchMemberRoutes(
  options: CuratedMatchRevalidateOptions = {}
): void {
  const opts = { ...DEFAULT_MEMBER_ROUTES, ...options }

  if (opts.profile) {
    revalidatePath('/profile')
  }
  if (opts.matches) {
    revalidatePath('/matches')
  }
  if (opts.compatibility) {
    revalidatePath('/compatibility')
  }
  if (opts.messages) {
    revalidatePath('/messages')
  }
  if (opts.adminCuratedIntros) {
    revalidatePath('/admin/curated-intros')
  }
  if (opts.adminCuratedMatches) {
    revalidatePath('/admin/curated-matches')
  }
  if (opts.adminMessageReports) {
    revalidatePath('/admin/message-reports')
  }
  if (opts.conversationId) {
    revalidatePath(`/messages/${opts.conversationId}`)
  }
  if (opts.memberId) {
    revalidatePath(`/members/${opts.memberId}`)
  }
}
