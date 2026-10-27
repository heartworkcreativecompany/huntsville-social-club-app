import Link from 'next/link'
import BrandLogo from '@/components/brand/brand-logo'
import {
  HOME_HEADER_JOIN_CTA,
  HOME_HEADER_SIGN_IN,
} from '@/lib/marketing-home-copy'
import {
  marketingButtonPrimaryClassName,
  marketingNavLinkClassName,
} from '@/lib/event-labels'

export default function PublicHomeHeader({
  loginHref,
  signupHref,
  tone = 'overlay',
}: {
  loginHref: string
  signupHref: string
  tone?: 'overlay' | 'solid'
}) {
  const surface =
    tone === 'solid'
      ? 'z-30 border-b border-border bg-background'
      : 'z-20'
  const padding =
    tone === 'solid'
      ? 'gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] md:gap-3 md:px-10 md:py-6'
      : 'gap-3 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:px-10 md:py-6'

  return (
    <header
      data-public-header={tone}
      className={`relative flex min-w-0 shrink-0 items-center justify-between ${surface} ${padding}`}
    >
      <div className="min-w-0">
        <BrandLogo
          href="/"
          variant="wordmark"
          size="xl"
          className="max-w-[6.75rem] sm:max-w-none"
          priority
        />
      </div>
      <nav aria-label="Public" className="flex shrink-0 items-center gap-1 sm:gap-3">
        <Link href={loginHref} className={marketingNavLinkClassName}>
          {HOME_HEADER_SIGN_IN}
        </Link>
        <Link
          href={signupHref}
          className={`${marketingButtonPrimaryClassName} px-3 text-xs sm:px-6 sm:text-sm`}
        >
          {HOME_HEADER_JOIN_CTA}
        </Link>
      </nav>
    </header>
  )
}
