'use client'

import Script from 'next/script'
import { useRef } from 'react'
import { metaPixelId, metaPixelScript, pageview } from '@/lib/meta-pixel'

/**
 * Website Meta Pixel. Verification steps are in docs/meta-pixel.md.
 * The initial PageView is sent once, after the bootstrap defines fbq.
 */
export function MetaPixel() {
  const trackedInitialPageView = useRef(false)
  const pixelId = metaPixelId()
  const script = pixelId ? metaPixelScript(pixelId) : null
  if (!pixelId || !script) return null

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        onReady={() => {
          if (trackedInitialPageView.current) return
          trackedInitialPageView.current = true
          // next/script calls onReady before inserting an inline script, and
          // onLoad does not run for inline scripts. The microtask runs after
          // fbq('init') has executed.
          queueMicrotask(() => {
            pageview()
          })
        }}
      >
        {script}
      </Script>
      <noscript>
        {/* Meta's noscript fallback is a 1x1 tracking image and cannot use next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          height={1}
          width={1}
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  )
}
