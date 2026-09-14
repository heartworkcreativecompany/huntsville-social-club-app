import Link from 'next/link'
import BrandLogo from '@/components/brand/brand-logo'
import ApplyMembershipCta from '@/components/marketing/apply-membership-cta'
import { marketingNavLinkClassName } from '@/lib/event-labels'

export default function PublicHomeHeader({
  loginHref,
  signupHref,
}: {
  loginHref: string
  signupHref: string
}) {
  return (
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
      <nav aria-label="Public" className="flex shrink-0 items-center gap-1 sm:gap-3">
        <Link href={loginHref} className={marketingNavLinkClassName}>
          Sign in
        </Link>
        <ApplyMembershipCta
          href={signupHref}
          className="max-sm:hidden px-3 text-xs sm:px-6 sm:text-sm"
        />
      </nav>
    </header>
  )
}
