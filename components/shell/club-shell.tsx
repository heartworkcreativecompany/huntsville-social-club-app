import ClubNav from './club-nav'
import SiteFooter from './site-footer'
import type { ApplicationStatus } from '@/lib/application'
import type { MemberNotificationItem } from '@/lib/load-member-notifications'

export default function ClubShell({
  children,
  role,
  canAccessApp,
  applicationStatus,
  showMatchesNav,
  showFriendsNav = false,
  notifications,
  unreadNotificationCount,
}: {
  children: React.ReactNode
  role: string
  canAccessApp: boolean
  applicationStatus: ApplicationStatus
  showMatchesNav: boolean
  showFriendsNav?: boolean
  notifications: MemberNotificationItem[]
  unreadNotificationCount: number
}) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <ClubNav
        role={role}
        canAccessApp={canAccessApp}
        applicationStatus={applicationStatus}
        showMatchesNav={showMatchesNav}
        showFriendsNav={showFriendsNav}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
      />
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
