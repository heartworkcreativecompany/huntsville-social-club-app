import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { Montserrat, Raleway } from 'next/font/google'
import { MetaPixel } from '@/components/analytics/MetaPixel'
import { MetaPixelPageView } from '@/components/analytics/MetaPixelPageView'
import './globals.css'

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const raleway = Raleway({
  variable: '--font-raleway',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Huntsville Social Club',
  description:
    'Join Huntsville Social Club for free and meet people through thoughtful gatherings, local experiences, and plans worth getting out for.',
}

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/

function googleTagManagerId() {
  const id = process.env.NEXT_PUBLIC_GTM_ID?.trim()
  if (!id || !GTM_ID_PATTERN.test(id)) return null
  return id
}

/** Official Google Tag Manager container snippet. The container ID is the only interpolated value. */
function googleTagManagerScript(id: string) {
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const gtmId = googleTagManagerId()

  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${raleway.variable} h-full overflow-x-clip antialiased`}
    >
      {gtmId ? (
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: googleTagManagerScript(gtmId),
            }}
          />
        </head>
      ) : null}
      <body className="flex min-h-full min-w-0 flex-col overflow-x-clip">
        {gtmId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        ) : null}
        {children}
        <MetaPixel />
        <Suspense fallback={null}>
          <MetaPixelPageView />
        </Suspense>
        <Analytics />
      </body>
    </html>
  )
}
