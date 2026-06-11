import Card from '@/components/ui/card'
import Badge from '@/components/ui/badge'
import {
  billingStatusLabel,
  parseMembershipBilling,
} from '@/lib/membership-systems'

export default function MemberBillingStatus({
  billingRaw,
}: {
  billingRaw: unknown
}) {
  const billing = parseMembershipBilling(billingRaw)
  const label = billingStatusLabel(billing)

  return (
    <Card padding="sm">
      <h2 className="text-display text-lg font-semibold">
        Membership status
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge
          variant={
            billing.payment_failure.active || billing.subscription_status === 'past_due'
              ? 'warning'
              : billing.subscription_status === 'active'
                ? 'success'
                : 'muted'
          }
        >
          {label}
        </Badge>
      </div>
      {billing.payment_failure.active ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          There is a payment issue on your account. Update billing to keep
          membership access — contact support if you need help.
        </p>
      ) : billing.renewal_at ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Renewal: {new Date(billing.renewal_at).toLocaleDateString()}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Billing integrations can be connected when payment processing launches.
        </p>
      )}
    </Card>
  )
}
