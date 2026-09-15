import Image from 'next/image'
import Link from 'next/link'
import ApplyMembershipCta from '@/components/marketing/apply-membership-cta'
import PublicHomeHeader from '@/components/marketing/public-home-header'
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
  HOW_MEMBERSHIP_WORKS_EYEBROW,
  HOW_MEMBERSHIP_WORKS_HEADLINE,
  HOW_MEMBERSHIP_WORKS_STEPS,
  IMPLIED_EXPERIENCES,
  IMPLIED_EXPERIENCES_HEADLINE,
  IMPLIED_EXPERIENCES_INTRO,
  MEMBERSHIP_VALUE_BODY,
  MEMBERSHIP_VALUE_DETAILS_LABEL,
  MEMBERSHIP_VALUE_HEADLINE,
  PUBLIC_PRICING_PATH,
  WHO_IT_IS_FOR_EYEBROW,
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
          className="object-cover object-[72%_center] sm:object-[48%_center] lg:object-[22%_center]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/35 to-black/88"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent max-md:via-black/10 lg:from-black/50"
          aria-hidden
        />
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
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {IMPLIED_EXPERIENCES.map((item) => (
              <li
                key={item.title}
                className="group relative min-h-[16rem] overflow-hidden rounded-xl border border-border"
              >
                <Image
                  src={item.imageSrc}
                  alt={item.imageAlt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
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
        aria-labelledby="who-it-is-for-heading"
        className="relative overflow-hidden"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_12%_0%,rgba(175,139,90,0.08),transparent_55%)]"
          aria-hidden
        />
        <div className="grain absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10">
          <p className="hero-eyebrow">
            <span className="hero-eyebrow-line" aria-hidden />
            {WHO_IT_IS_FOR_EYEBROW}
          </p>
          <h2
            id="who-it-is-for-heading"
            className="font-brand mt-5 max-w-3xl text-3xl font-semibold sm:text-4xl"
          >
            {WHO_IT_IS_FOR_HEADLINE}
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2">
            {WHO_IT_IS_FOR_ITEMS.map((item, index) => (
              <li
                key={item}
                className={`relative overflow-hidden border border-white/10 bg-surface/90 px-5 py-6 shadow-[inset_0_1px_0_rgba(175,139,90,0.16)] sm:px-6 ${
                  index === WHO_IT_IS_FOR_ITEMS.length - 1
                    ? 'sm:col-span-2 sm:max-w-xl sm:justify-self-center lg:max-w-none'
                    : ''
                }`}
              >
                <span
                  className="absolute inset-y-4 left-0 w-px bg-accent/55"
                  aria-hidden
                />
                <p className="font-brand text-[0.7rem] font-medium tracking-[0.28em] text-accent uppercase">
                  <span className="sr-only">Statement </span>
                  {String(index + 1).padStart(2, '0')}
                </p>
                <p className="mt-3 text-base leading-relaxed text-foreground sm:text-[1.05rem]">
                  {item}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="how-membership-works-heading"
        className="relative overflow-hidden border-y border-white/10 bg-surface"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(175,139,90,0.05),transparent_28%)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10">
          <p className="hero-eyebrow">
            <span className="hero-eyebrow-line" aria-hidden />
            {HOW_MEMBERSHIP_WORKS_EYEBROW}
          </p>
          <h2
            id="how-membership-works-heading"
            className="font-brand mt-5 text-3xl font-semibold sm:text-4xl"
          >
            {HOW_MEMBERSHIP_WORKS_HEADLINE}
          </h2>
          <div className="relative mt-12">
            <span
              className="pointer-events-none absolute top-5 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-accent/15 via-accent/55 to-accent/15 md:block"
              aria-hidden
            />
            <ol className="relative ms-1 border-s border-accent/35 ps-8 md:ms-0 md:border-s-0 md:ps-0 md:grid md:grid-cols-4 md:gap-6">
            {HOW_MEMBERSHIP_WORKS_STEPS.map((step, index) => (
              <li key={step} className="relative pb-10 last:pb-0 md:pb-0">
                <span
                  className="font-brand absolute top-0 -left-8 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center border border-accent/50 bg-surface text-sm font-semibold text-accent md:static md:mb-5 md:translate-x-0"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <p className="pt-1.5 text-base leading-relaxed text-foreground md:max-w-[16rem] md:pt-0">
                  <span className="sr-only">Step {index + 1}. </span>
                  {step}
                </p>
              </li>
            ))}
            </ol>
          </div>
          <div className="mt-10">
            <ApplyMembershipCta href={signupHref} className="w-fit" />
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
