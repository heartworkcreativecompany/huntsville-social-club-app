import Link from 'next/link'
import {
  BOTTOM_CTA,
  PRICING_PLANS,
} from '@/lib/membership-pricing-copy'
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  marketingButtonPrimaryClassName,
  marketingButtonSecondaryClassName,
} from '@/lib/event-labels'

export default function PricingBottomCta({
  variant = 'club',
}: {
  variant?: 'club' | 'marketing'
}) {
  const primary = variant === 'marketing' ? marketingButtonPrimaryClassName : buttonPrimaryClassName
  const secondary =
    variant === 'marketing' ? marketingButtonSecondaryClassName : buttonSecondaryClassName

  return (
    <section className="mt-16 rounded-xl border border-accent/30 bg-accent-soft/30 p-8 text-center sm:p-10">
      <h2 className="text-display text-2xl font-semibold sm:text-3xl">
        {BOTTOM_CTA.headline}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
        {BOTTOM_CTA.subtext}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={variant === 'marketing' ? '/signup' : '/dashboard'}
          className={secondary}
        >
          {PRICING_PLANS.member.cta}
        </Link>
        <Link
          href={variant === 'marketing' ? '/signup' : '/upgrade'}
          className={primary}
        >
          {PRICING_PLANS.inner_circle.cta}
        </Link>
        <Link
          href={variant === 'marketing' ? '/signup' : '/upgrade'}
          className={primary}
        >
          {PRICING_PLANS.elite_circle.cta}
        </Link>
      </div>
    </section>
  )
}
