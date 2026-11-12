import type { Metadata } from 'next'
import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Refund Policy',
  description:
    'Refunds for monthly memberships, paid event tickets, and event sponsorships at Huntsville Social Club.',
}

export default function RefundPolicyPage() {
  return (
    <LegalPageShell title="Refund Policy">
      <p>
        This policy explains refunds for paid memberships, paid event tickets,
        and event sponsorships.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Memberships
      </h2>
      <p>
        Paid memberships are monthly. You can cancel at any time in billing.
        Cancellation takes effect at the end of the current billing period. We
        do not give partial-month refunds.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Paid event tickets
      </h2>
      <p>
        You receive a full refund if you cancel a paid event ticket at least
        48 hours before the event. There is no refund within 48 hours of the
        event, and there is no refund for no-shows. If Huntsville Social Club
        cancels the event, you receive a full refund.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Event sponsorships
      </h2>
      <p>
        Event sponsorships are refundable in full if cancelled at least 14 days
        before the event. Cancellations within 14 days of the event are not
        refundable. If Huntsville Social Club cancels the event, the sponsor
        receives a full refund or can move the sponsorship to a future event.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Billing help
      </h2>
      <p>
        Contact{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>{' '}
        for billing help.
      </p>

      <p className="text-xs">Last updated: November 11, 2026</p>
    </LegalPageShell>
  )
}
