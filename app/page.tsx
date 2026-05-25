import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/lib/event-labels'

export default async function PublicHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/home')
  }

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <p className="text-display text-xl font-medium text-foreground">
            Huntsville Social Club
          </p>
          <Link href="/login" className={buttonSecondaryClassName}>
            Member sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Private membership · Huntsville
        </p>
        <h1 className="text-display mt-4 text-4xl font-medium leading-tight text-foreground sm:text-5xl">
          A calm, credible home for verified local membership
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
          Not another social feed. A selective club for people who show up,
          contribute, and build trust through real gatherings and intentional
          connections.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/login" className={buttonPrimaryClassName}>
            Apply or sign in
          </Link>
        </div>

        <ul className="mt-16 grid gap-4 border-t border-border pt-10 text-sm text-muted-foreground sm:grid-cols-3">
          <li>
            <span className="font-medium text-foreground">Verified</span>
            <br />
            Every member is reviewed before full access.
          </li>
          <li>
            <span className="font-medium text-foreground">Curated</span>
            <br />
            Discovery highlights intent, not noise.
          </li>
          <li>
            <span className="font-medium text-foreground">Operational</span>
            <br />
            Events, RSVPs, and hosts stay clear and calm.
          </li>
        </ul>
      </main>
    </div>
  )
}
