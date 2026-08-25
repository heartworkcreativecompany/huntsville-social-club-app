import Image from 'next/image'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import BrandLogo from '@/components/brand/brand-logo'
import PublicFeatureCard from '@/components/marketing/public-feature-card'
import SiteFooter from '@/components/shell/site-footer'
import {
  classifyHost,
  membersOrigin,
  resolveRequestHost,
  rootRouteAction,
} from '@/lib/hostnames'
import { createClient } from '@/lib/supabase/server'
import {
  marketingButtonPrimaryClassName,
  marketingButtonSecondaryClassName,
  marketingNavLinkClassName,
} from '@/lib/event-labels'

export default async function PublicHomePage() {
  const headersList = await headers()
  const hostKind = classifyHost(resolveRequestHost(headersList))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const action = rootRouteAction(hostKind, Boolean(user))
  if (action.type === 'redirect') {
    redirect(action.location)
  }

  // Absolute portal CTAs so login/signup always land on the members host.
  const loginHref = `${membersOrigin()}/login`
  const signupHref = `${membersOrigin()}/signup`

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="relative flex min-h-[92vh] items-end overflow-hidden">
        <Image
          src="/brand/hsc-hero-lounge.jpg"
          alt="Members lounge interior with velvet seating, brass sconces, and candlelight"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/85" />
        <div className="grain absolute inset-0" aria-hidden />

        <header className="absolute top-0 right-0 left-0 z-20 flex min-w-0 items-center justify-between gap-3 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:px-10 md:py-6">
          <div className="min-w-0">
            <BrandLogo
              href="/"
              variant="wordmark"
              size="xl"
              className="max-w-[6.75rem] sm:max-w-none"
              priority
            />
          </div>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-3">
            <Link href={loginHref} className={marketingNavLinkClassName}>
              Sign in
            </Link>
            <Link
              href={signupHref}
              className={`${marketingButtonPrimaryClassName} max-sm:hidden px-3 text-xs sm:px-6 sm:text-sm`}
            >
              Join the club
            </Link>
          </nav>
        </header>

        <div className="relative z-10 mx-auto w-full min-w-0 max-w-6xl px-5 pb-16 text-white sm:px-6 md:px-10 md:pb-28">
          <span className="hero-eyebrow">
            <span className="hero-eyebrow-line" aria-hidden />
            Huntsville · Rocket City
          </span>
          <h1 className="font-brand mt-5 max-w-3xl text-4xl leading-[1.08] font-semibold sm:text-5xl md:text-7xl">
            Where Huntsville Connects — Live
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85 md:text-xl">
            Mingle mixers, speed dating, and curated socials for people who want to
            meet in real life.
          </p>
          <p className="mt-2 max-w-xl text-white/60">
            Bringing singles and social seekers together in Rocket City.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={signupHref}
              className={`${marketingButtonPrimaryClassName} w-full sm:w-auto`}
            >
              Get started
            </Link>
            <Link
              href={loginHref}
              className={`${marketingButtonSecondaryClassName} w-full sm:w-auto`}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 sm:py-24 md:px-8">
        <ul className="grid gap-6 sm:grid-cols-2">
          <PublicFeatureCard
            icon="cocktail-gold"
            title="Curated Nights"
            description="Rooftop mixers, themed socials, and speed dating events designed to feel elevated, easy, and actually worth attending."
          />
          <PublicFeatureCard
            icon="lookingglass-heart-gold"
            title="Real Connections"
            description="Meet singles and social seekers in person through experiences built for conversation, chemistry, and fun."
          />
        </ul>
      </section>

      <SiteFooter variant="marketing" />
    </div>
  )
}
