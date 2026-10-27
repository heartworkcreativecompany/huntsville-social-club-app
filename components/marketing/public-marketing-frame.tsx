import PublicHomeHeader from '@/components/marketing/public-home-header'
import SiteFooter from '@/components/shell/site-footer'
import VisualViewportFrame from '@/components/shell/visual-viewport-frame'
import { portalCtaHref } from '@/lib/hostnames'

export function publicMarketingSignupHref(): string {
  return portalCtaHref('marketing', '/signup')
}

export function publicMarketingLoginHref(): string {
  return portalCtaHref('marketing', '/login')
}

export function memberEventRsvpHref(eventId: string): string {
  return `https://members.huntsvillesocialclub.com/events/${eventId}`
}

export default function PublicMarketingFrame({
  children,
}: {
  children: React.ReactNode
}) {
  const loginHref = publicMarketingLoginHref()
  const signupHref = publicMarketingSignupHref()

  return (
    <VisualViewportFrame>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-foreground"
      >
        Skip to content
      </a>
      <PublicHomeHeader
        loginHref={loginHref}
        signupHref={signupHref}
        tone="solid"
      />
      <div
        data-public-content-scroll
        className="min-h-0 flex-1 overflow-x-clip overflow-y-auto overscroll-y-contain scroll-pt-4"
      >
        <main id="main-content">{children}</main>
        <SiteFooter variant="marketing" signupHref={signupHref} />
      </div>
    </VisualViewportFrame>
  )
}

export function publicEventDetailHref(eventId: string): string {
  return `/events/${eventId}`
}
