import { NextResponse, type NextRequest } from 'next/server'
import {
  classifyHost,
  proxyHostAction,
  resolveRequestHost,
} from '@/lib/hostnames'
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

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
