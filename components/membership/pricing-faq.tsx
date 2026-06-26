import Card from '@/components/ui/card'
import { PRICING_FAQ } from '@/lib/membership-pricing-copy'

export default function PricingFaq() {
  return (
    <section className="mt-16">
      <h2 className="text-display text-2xl font-semibold">
        Frequently asked questions
      </h2>
      <div className="mt-6 grid gap-4">
        {PRICING_FAQ.map((item) => (
          <Card key={item.question} padding="sm">
            <h3 className="font-medium text-foreground">{item.question}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </Card>
        ))}
      </div>
    </section>
  )
}
