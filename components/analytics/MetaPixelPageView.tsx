'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { pageview } from '@/lib/meta-pixel'

/** The first URL is the load already tracked by MetaPixel. */
export function shouldTrackRoutePageView(previousUrl: string | null, nextUrl: string) {
  return previousUrl !== null && previousUrl !== nextUrl
}

export function MetaPixelPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const previousUrl = useRef<string | null>(null)
  const query = searchParams.toString()
  const url = pathname ? `${pathname}${query ? `?${query}` : ''}` : ''

  useEffect(() => {
    if (!url) return
    if (shouldTrackRoutePageView(previousUrl.current, url)) {
      pageview()
    }
    previousUrl.current = url
  }, [url])

  return null
}
