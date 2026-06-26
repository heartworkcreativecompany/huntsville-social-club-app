import Link from 'next/link'
import BrandLogo from '@/components/brand/brand-logo'
import PricingPageContent from '@/components/membership/pricing-page-content'
import SiteFooter from '@/components/shell/site-footer'
import {
  marketingButtonPrimaryClassName,
} from '@/lib/event-labels'

export default function PublicPricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <BrandLogo href="/" variant="wordmark" size="lg" />
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-accent">
              Sign in
            </Link>
            <Link href="/signup" className={marketingButtonPrimaryClassName}>
              Join the club
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full flex-1 px-5 py-12 sm:px-8 sm:py-16">
        <PricingPageContent mode="public" />
      </main>

      <SiteFooter variant="marketing" />
    </div>
  )
}
