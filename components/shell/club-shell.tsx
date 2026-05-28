import ClubNav from './club-nav'
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
    <div className="min-h-full bg-background">
      <ClubNav
        role={role}
        canAccessApp={canAccessApp}
        applicationStatus={applicationStatus}
      />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  )
}
