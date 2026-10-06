import { NextResponse, type NextRequest } from 'next/server'
import {
  classifyHost,
  proxyHostAction,
  proxyMembersInternalPublicEventsRedirect,
  proxyPublicEventsRewrite,
  resolveRequestHost,
} from '@/lib/hostnames'
import { applyPendingMembershipPlanCookie } from '@/lib/pending-membership-plan'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const hostKind = classifyHost(resolveRequestHost(request.headers))
  const action = proxyHostAction(
    hostKind,
    request.nextUrl.pathname,
    request.nextUrl.search
  )

  if (action.type === 'redirect') {
    return NextResponse.redirect(action.location, action.status)
  }

  const internalFallback = proxyMembersInternalPublicEventsRedirect(
    hostKind,
    request.nextUrl.pathname,
    request.nextUrl.search
  )
  if (internalFallback) {
    const location = new URL(internalFallback.location, request.url)
    return NextResponse.redirect(location, internalFallback.status)
  }

  const rewritePath = proxyPublicEventsRewrite(
    hostKind,
    request.nextUrl.pathname
  )
  let rewriteResponse: NextResponse | undefined
  if (rewritePath) {
    const url = request.nextUrl.clone()
    url.pathname = rewritePath
    rewriteResponse = NextResponse.rewrite(url)
  }

  const response = await updateSession(request, rewriteResponse)
  return applyPendingMembershipPlanCookie(request, response)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
