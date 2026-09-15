import Image from 'next/image'
import Link from 'next/link'
import ApplyMembershipCta from '@/components/marketing/apply-membership-cta'
import FounderNotePlaceholder from '@/components/marketing/founder-note-placeholder'
import PublicHomeHeader from '@/components/marketing/public-home-header'
import SocialIntroVideo from '@/components/marketing/social-intro-video'
import {
  APPLY_FOR_MEMBERSHIP_CTA,
  FINAL_CTA_BODY,
  FINAL_CTA_HEADLINE,
  FINAL_CTA_REASSURANCE,
  HOME_HERO_BODY,
  HOME_HERO_EYEBROW,
  HOME_HERO_HEADLINE,
  HOME_HERO_IMAGE_ALT,
  HOME_HERO_IMAGE_SRC,
  HOME_HERO_SUPPORT_LINE_PRIMARY,
  HOME_HERO_SUPPORT_LINE_SECONDARY,
  HOME_MEMBERSHIP_TIERS,
  HOW_MEMBERSHIP_WORKS_HEADLINE,
  HOW_MEMBERSHIP_WORKS_STEPS,
  IMPLIED_EXPERIENCES,
  IMPLIED_EXPERIENCES_HEADLINE,
  IMPLIED_EXPERIENCES_INTRO,
  MEMBERSHIP_VALUE_BODY,
  MEMBERSHIP_VALUE_DETAILS_LABEL,
  MEMBERSHIP_VALUE_HEADLINE,
  PUBLIC_PRICING_PATH,
  SOCIAL_INTRO_HEADLINE,
  SOCIAL_INTRO_SUPPORTING,
  WHO_IT_IS_FOR_HEADLINE,
  WHO_IT_IS_FOR_ITEMS,
  WHY_EXISTS_CARDS,
  WHY_EXISTS_HEADLINE,
  WHY_EXISTS_INTRO,
} from '@/lib/marketing-home-copy'

export default function PublicHomeContent({
  loginHref,
  signupHref,
}: {
  loginHref: string
  signupHref: string
}) {
  return (
    <>
      <section
        aria-labelledby="home-hero-heading"
        className="relative isolate overflow-hidden"
      >
        <Image
          src={HOME_HERO_IMAGE_SRC}
          alt={HOME_HERO_IMAGE_ALT}
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_42%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/88" />
        <div className="grain absolute inset-0" aria-hidden />

        <div className="relative z-10 flex min-h-[100svh] flex-col md:min-h-[92vh]">
          <PublicHomeHeader loginHref={loginHref} signupHref={signupHref} />
          <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col justify-end px-5 pt-6 pb-16 text-white sm:px-6 md:px-10 md:pt-8 md:pb-28">
            <span className="hero-eyebrow">
              <span className="hero-eyebrow-line" aria-hidden />
              {HOME_HERO_EYEBROW}
            </span>
            <h1
              id="home-hero-heading"
              className="font-brand mt-5 max-w-3xl text-4xl leading-[1.08] font-semibold text-balance sm:text-5xl md:text-7xl"
            >
              {HOME_HERO_HEADLINE}
            </h1>
            <p className="mt-6 max-w-xl text-left text-lg leading-relaxed text-white/85 md:text-xl">
              {HOME_HERO_BODY}
            </p>
            <div className="mt-9 max-w-xl">
              <ApplyMembershipCta
                href={signupHref}
                label={APPLY_FOR_MEMBERSHIP_CTA}
                className="w-fit"
              />
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/80">
                {HOME_HERO_SUPPORT_LINE_PRIMARY}
              </p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/65">
                {HOME_HERO_SUPPORT_LINE_SECONDARY}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="social-intro-heading"
        className="border-b border-white/10 bg-surface"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-6 sm:py-20 md:grid-cols-[minmax(0,1fr)_20rem] md:px-10 lg:gap-16">
          <div>
            <h2
              id="social-intro-heading"
              className="font-brand text-3xl font-semibold text-foreground sm:text-4xl"
            >
              {SOCIAL_INTRO_HEADLINE}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {SOCIAL_INTRO_SUPPORTING}
            </p>
          </div>
          <SocialIntroVideo />
        </div>
      </section>

      <section
        aria-labelledby="why-exists-heading"
        className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10"
      >
        <h2
          id="why-exists-heading"
          className="font-brand max-w-3xl text-3xl font-semibold sm:text-4xl"
        >
          {WHY_EXISTS_HEADLINE}
        </h2>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {WHY_EXISTS_INTRO}
        </p>
        <ul className="mt-10 grid gap-6 lg:grid-cols-3">
          {WHY_EXISTS_CARDS.map((card) => (
            <li
              key={card.challenge}
              className="rounded-xl border border-border bg-surface p-6 shadow-sm"
            >
              <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
                The challenge
              </p>
              <h3 className="text-display mt-3 text-lg font-semibold leading-snug">
                {card.challenge}
              </h3>
              <p className="mt-5 text-xs font-medium tracking-[0.2em] text-accent uppercase">
                How the club responds
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {card.response}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="implied-experiences-heading"
        className="border-y border-white/10 bg-surface"
      >
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10">
          <h2
            id="implied-experiences-heading"
            className="font-brand max-w-3xl text-3xl font-semibold sm:text-4xl"
          >
            {IMPLIED_EXPERIENCES_HEADLINE}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {IMPLIED_EXPERIENCES_INTRO}
          </p>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {IMPLIED_EXPERIENCES.map((item) => (
              <li
                key={item.title}
                className="group relative min-h-[16rem] overflow-hidden rounded-xl border border-border"
              >
                <Image
                  src={item.imageSrc}
                  alt={item.imageAlt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />
                <div className="relative flex h-full min-h-[16rem] flex-col justify-end p-5">
                  <h3 className="font-brand text-lg font-semibold text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/80">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <ApplyMembershipCta href={signupHref} className="w-full sm:w-auto" />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="membership-value-heading"
        className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10"
      >
        <h2
          id="membership-value-heading"
          className="font-brand max-w-3xl text-3xl font-semibold sm:text-4xl"
        >
          {MEMBERSHIP_VALUE_HEADLINE}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {MEMBERSHIP_VALUE_BODY}
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {HOME_MEMBERSHIP_TIERS.map((tier) => (
            <li
              key={tier.name}
              className="rounded-xl border border-border bg-surface p-6 shadow-sm"
            >
              <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
                {tier.optionalPaid ? 'Optional paid' : 'Free to start'}
              </p>
              <h3 className="text-display mt-3 text-xl font-semibold">{tier.name}</h3>
              <p className="mt-1 text-sm text-foreground">{tier.price}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {tier.summary}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ApplyMembershipCta href={signupHref} className="w-full sm:w-auto" />
          <Link
            href={PUBLIC_PRICING_PATH}
            className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {MEMBERSHIP_VALUE_DETAILS_LABEL}
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="how-membership-works-heading"
        className="border-y border-white/10 bg-surface"
      >
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10">
          <h2
            id="how-membership-works-heading"
            className="font-brand text-3xl font-semibold sm:text-4xl"
          >
            {HOW_MEMBERSHIP_WORKS_HEADLINE}
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-2">
            {HOW_MEMBERSHIP_WORKS_STEPS.map((step, index) => (
              <li
                key={step}
                className="flex gap-4 rounded-xl border border-border bg-background p-6"
              >
                <span
                  aria-hidden
                  className="font-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
                >
                  {index + 1}
                </span>
                <p className="pt-1.5 text-base leading-relaxed text-foreground">
                  {step}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <ApplyMembershipCta href={signupHref} className="w-full sm:w-auto" />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="who-it-is-for-heading"
        className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10"
      >
        <h2
          id="who-it-is-for-heading"
          className="font-brand max-w-3xl text-3xl font-semibold sm:text-4xl"
        >
          {WHO_IT_IS_FOR_HEADLINE}
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {WHO_IT_IS_FOR_ITEMS.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-border bg-surface px-5 py-4 text-sm leading-relaxed text-foreground sm:text-base"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto max-w-6xl px-5 sm:px-6 md:px-10">
        <FounderNotePlaceholder />
      </div>

      <section
        aria-labelledby="final-cta-heading"
        className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10"
      >
        <div className="rounded-2xl border border-accent/35 bg-accent-soft/30 px-6 py-12 text-center sm:px-10 sm:py-16">
          <h2
            id="final-cta-heading"
            className="font-brand text-3xl font-semibold sm:text-4xl"
          >
            {FINAL_CTA_HEADLINE}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {FINAL_CTA_BODY}
          </p>
          <div className="mt-8 flex justify-center">
            <ApplyMembershipCta href={signupHref} className="w-full sm:w-auto" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{FINAL_CTA_REASSURANCE}</p>
        </div>
      </section>
    </>
  )
}
