import Link from 'next/link'
import { redirect } from 'next/navigation'
import BrandLogo from '@/components/brand/brand-logo'
import SiteFooter from '@/components/shell/site-footer'
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
    <div className="flex min-h-full flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <BrandLogo variant="wordmark" size="md" priority />
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/login" className={buttonSecondaryClassName}>
              Sign in
            </Link>
            <Link href="/signup" className={buttonPrimaryClassName}>
              Join the club
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mb-8 flex justify-center sm:justify-start">
          <BrandLogo variant="circle" size="lg" />
        </div>
        <p className="eyebrow">Huntsville · Rocket City</p>
        <h1 className="text-display mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
          Where Huntsville Connects
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-foreground">
          Mingle mixers, speed dating, and curated socials for people who want to
          meet in real life.
        </p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          Bringing singles and social seekers together in Rocket City.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/signup" className={buttonPrimaryClassName}>
            Get started
          </Link>
          <Link href="/login" className={buttonSecondaryClassName}>
            Sign in
          </Link>
        </div>

        <ul className="mt-16 grid gap-6 border-t border-border pt-10 sm:grid-cols-2">
          <li className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-display text-lg font-semibold">Curated Nights</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Rooftop mixers, themed socials, and speed dating events designed to
              feel elevated, easy, and actually worth attending.
            </p>
          </li>
          <li className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-display text-lg font-semibold">Real Connections</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Meet singles and social seekers in person through experiences built
              for conversation, chemistry, and fun.
            </p>
          </li>
        </ul>
      </main>

      <SiteFooter />
    </div>
  )
}
