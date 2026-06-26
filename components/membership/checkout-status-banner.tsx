import Card from '@/components/ui/card'

export default function CheckoutStatusBanner({
  status,
}: {
  status: 'success' | 'cancelled' | null
}) {
  if (!status) return null

  if (status === 'success') {
    return (
      <Card padding="sm" className="mb-8 border-accent/30 bg-accent-soft/30">
        <p className="text-sm text-foreground">
          Payment received. Your membership will activate shortly once Stripe
          confirms your subscription — refresh this page in a moment if your plan
          has not updated yet.
        </p>
      </Card>
    )
  }

  return (
    <Card padding="sm" className="mb-8 border-border bg-surface-elevated">
      <p className="text-sm text-muted-foreground">
        Checkout was cancelled. You can choose a plan whenever you are ready.
      </p>
    </Card>
  )
}
