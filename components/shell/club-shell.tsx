import ClubNav from './club-nav'
import SiteFooter from './site-footer'
import type { ApplicationStatus } from '@/lib/application'

export default function ClubShell({
  children,
  role,
  canAccessApp,
  applicationStatus,
}: {
  children: React.ReactNode
  role: string
  canAccessApp: boolean
  applicationStatus: ApplicationStatus
}) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <ClubNav
        role={role}
        canAccessApp={canAccessApp}
        applicationStatus={applicationStatus}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
