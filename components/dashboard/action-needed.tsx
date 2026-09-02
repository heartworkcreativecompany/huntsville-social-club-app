import Link from 'next/link'
import Card from '@/components/ui/card'
import { buttonSecondaryClassName } from '@/lib/event-labels'
import type { DashboardActionNeededCard } from '@/lib/dashboard/action-needed'

export default function ActionNeeded({
  cards,
}: {
  cards: DashboardActionNeededCard[]
}) {
  if (cards.length === 0) {
    return null
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-display text-xl font-semibold">Action needed</h2>
      </div>
      <ul className="grid gap-3">
        {cards.map((card) => (
          <li key={card.kind}>
            <Card padding="sm">
              <h3 className="text-display text-lg font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {card.description}
              </p>
              <Link href={card.href} className={`mt-4 ${buttonSecondaryClassName}`}>
                {card.ctaLabel}
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
