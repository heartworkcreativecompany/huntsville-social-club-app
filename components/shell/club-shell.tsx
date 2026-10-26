import ClubNav from './club-nav'
import SiteFooter from './site-footer'
import VisualViewportFrame from './visual-viewport-frame'
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
    <VisualViewportFrame>
      <ClubNav
        role={role}
        canAccessApp={canAccessApp}
        applicationStatus={applicationStatus}
        showMatchesNav={showMatchesNav}
        showFriendsNav={showFriendsNav}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
      />
      <div
        data-club-content-scroll
        className="min-h-0 flex-1 overflow-x-clip overflow-y-auto"
      >
        <main className="mx-auto w-full min-w-0 max-w-6xl px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10">
          {children}
        </main>
        <SiteFooter />
      </div>
    </VisualViewportFrame>
  )
}
