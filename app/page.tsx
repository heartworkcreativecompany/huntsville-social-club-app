import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import PublicHomeContent from '@/components/marketing/public-home-content'
import SiteFooter from '@/components/shell/site-footer'
import {
  classifyHost,
  portalCtaHref,
  resolveRequestHost,
  rootRouteAction,
} from '@/lib/hostnames'
import { createClient } from '@/lib/supabase/server'

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

  const loginHref = portalCtaHref(hostKind, '/login')
  const signupHref = portalCtaHref(hostKind, '/signup')

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-foreground"
      >
        Skip to content
      </a>
      <main id="main-content">
        <PublicHomeContent loginHref={loginHref} signupHref={signupHref} />
      </main>
      <SiteFooter variant="marketing" signupHref={signupHref} />
    </div>
  )
}
