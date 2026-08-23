import { redirect } from 'next/navigation'
import ClubShell from '@/components/shell/club-shell'
import MemberPerksHydrator from '@/components/membership/member-perks-hydrator'
import { compatibilityContextForViewer } from '@/lib/compatibility/viewer-context'
import { loadOwnFriendshipQuestionnaire } from '@/lib/friendship/candidate-pool'
import { friendshipContextForViewer } from '@/lib/friendship/viewer-context'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { loadMemberNotifications } from '@/lib/load-member-notifications'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'

export default async function ClubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  const supabase = await createClient()
  const [{ entitlements }, notificationResult, friendshipQuestionnaire] =
    await Promise.all([
      loadMemberEntitlementsForViewer(),
      loadMemberNotifications(supabase, viewer.userId).catch(() => ({
        items: [],
        unreadCount: 0,
      })),
      loadOwnFriendshipQuestionnaire(supabase, viewer.userId).catch(() => null),
    ])
  const { canAccessMatchesInbox: showMatchesNav } = compatibilityContextForViewer(
    viewer,
    entitlements
  )
  const { canAccessFriendsNav: showFriendsNav } = friendshipContextForViewer(
    viewer,
    entitlements,
    friendshipQuestionnaire
  )

  return (
    <ClubShell
      role={viewer.role}
      canAccessApp={viewer.canAccessApp}
      applicationStatus={viewer.applicationStatus}
      showMatchesNav={showMatchesNav}
      showFriendsNav={showFriendsNav}
      notifications={notificationResult.items}
      unreadNotificationCount={notificationResult.unreadCount}
    >
      <MemberPerksHydrator entitlements={entitlements} />
      {children}
    </ClubShell>
  )
}
