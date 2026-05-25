import { redirect } from 'next/navigation'
import ClubShell from '@/components/shell/club-shell'
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

  return <ClubShell role={viewer.role}>{children}</ClubShell>
}
