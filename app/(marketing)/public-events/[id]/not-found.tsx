import Link from 'next/link'
import PublicMarketingFrame from '@/components/marketing/public-marketing-frame'

export default function PublicEventNotFound() {
  return (
    <PublicMarketingFrame>
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 md:px-10">
        <h1 className="font-brand text-3xl font-semibold">Event not found</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          This gathering is not on the public calendar.
        </p>
        <Link
          href="/events"
          className="mt-6 inline-flex text-sm font-medium text-accent underline underline-offset-4"
        >
          All events
        </Link>
      </div>
    </PublicMarketingFrame>
  )
}
