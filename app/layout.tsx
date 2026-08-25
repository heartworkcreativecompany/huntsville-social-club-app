import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { Montserrat, Raleway } from 'next/font/google'
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
    'Mingle mixers, speed dating, and curated socials — where Huntsville connects in real life.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${raleway.variable} h-full overflow-x-clip antialiased`}
    >
      <body className="flex min-h-full min-w-0 flex-col overflow-x-clip">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
