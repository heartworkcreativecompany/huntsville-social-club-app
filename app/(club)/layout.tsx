import { redirect } from 'next/navigation'
import ClubShell from '@/components/shell/club-shell'
import MemberPerksHydrator from '@/components/membership/member-perks-hydrator'
import { canShowDatingMatchesNav } from '@/lib/compatibility/viewer-context'
import { canShowFriendsMatchesNav } from '@/lib/friendship/viewer-context'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { loadMemberNotifications } from '@/lib/load-member-notifications'
import { redirectIfPendingMembershipPlan } from '@/lib/pending-membership-plan-server'
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

  await redirectIfPendingMembershipPlan(viewer.canAccessApp)

  const supabase = await createClient()
  const [{ entitlements }, notificationResult] = await Promise.all([
    loadMemberEntitlementsForViewer(),
    loadMemberNotifications(supabase, viewer.userId).catch(() => ({
      items: [],
      unreadCount: 0,
    })),
  ])

  return (
    <ClubShell
      role={viewer.role}
      canAccessApp={viewer.canAccessApp}
      applicationStatus={viewer.applicationStatus}
      showMatchesNav={canShowDatingMatchesNav(viewer, entitlements)}
      showFriendsNav={canShowFriendsMatchesNav(viewer, entitlements)}
      notifications={notificationResult.items}
      unreadNotificationCount={notificationResult.unreadCount}
    >
      <MemberPerksHydrator entitlements={entitlements} />
      {children}
    </ClubShell>
  )
}
