import ClubNav from './club-nav'

export default function ClubShell({
  children,
  role,
}: {
  children: React.ReactNode
  role: string
}) {
  return (
    <div className="min-h-full bg-background">
      <ClubNav role={role} showAdmin={role === 'admin'} />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  )
}
