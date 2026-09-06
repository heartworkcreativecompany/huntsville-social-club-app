import Link from 'next/link'
import Card from '@/components/ui/card'
import { buttonSecondaryClassName } from '@/lib/event-labels'

export const CONNECT_MATCHES_TEASER = {
  heading: 'Find your people with curated matches',
  body: 'Inner Circle members can complete Dating and Friendship Compatibility Questionnaires and receive curated recommendations based on shared values, interests, lifestyle, social style, and connection goals.',
  ctaLabel: 'Upgrade to Inner Circle',
  href: '/upgrade',
} as const

export default function ConnectMatchesTeaser() {
  return (
    <section>
      <Card padding="sm">
        <h2 className="text-display text-lg font-semibold">
          {CONNECT_MATCHES_TEASER.heading}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {CONNECT_MATCHES_TEASER.body}
        </p>
        <Link href={CONNECT_MATCHES_TEASER.href} className={`mt-4 ${buttonSecondaryClassName}`}>
          {CONNECT_MATCHES_TEASER.ctaLabel}
        </Link>
      </Card>
    </section>
  )
}
