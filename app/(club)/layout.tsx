import { redirect } from 'next/navigation'
import ClubShell from '@/components/shell/club-shell'
import { compatibilityContextForViewer } from '@/lib/compatibility/viewer-context'
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
  const [{ entitlements }, notificationResult] = await Promise.all([
    loadMemberEntitlementsForViewer(),
    loadMemberNotifications(supabase, viewer.userId).catch(() => ({
      items: [],
      unreadCount: 0,
    })),
  ])
  const { canAccessMatchesInbox: showMatchesNav } = compatibilityContextForViewer(
    viewer,
    entitlements
  )

  return (
    <ClubShell
      role={viewer.role}
      canAccessApp={viewer.canAccessApp}
      applicationStatus={viewer.applicationStatus}
      showMatchesNav={showMatchesNav}
      notifications={notificationResult.items}
      unreadNotificationCount={notificationResult.unreadCount}
    >
      {children}
    </ClubShell>
  )
}
