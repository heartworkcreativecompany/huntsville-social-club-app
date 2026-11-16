import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Reporting and Content Removal',
  description:
    'How to report a profile or content, how Huntsville Social Club reviews reports, and how to appeal a removal or suspension.',
}

export default function ReportingPage() {
  return (
    <LegalPageShell title="Reporting and Content Removal">
      <h2 className="text-display text-lg font-semibold">
        How to report
      </h2>
      <p>
        Use the Report option in any conversation, use the Block option, or
        email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
        . Anyone, including non-members, can report a profile or content by
        email, including content posted without their consent.
      </p>

      <h2 className="text-display text-lg font-semibold">
        How we review
      </h2>
      <p>
        An administrator reviews every report. Reports are reviewed within 2
        business days, and safety threats right away. Content that breaks our
        Terms or Code of Conduct is removed promptly. Depending on severity, we
        may remove content, suspend messaging, or permanently remove the
        member. Suspected illegal content is preserved and reported as
        described on the{' '}
        <Link href="/law-enforcement" className="text-accent underline">
          Law Enforcement and Legal Requests
        </Link>{' '}
        page.
      </p>

      <h2 className="text-display text-lg font-semibold">
        How to appeal
      </h2>
      <p>
        A member can appeal a removal or suspension by emailing{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>{' '}
        with the subject &quot;Appeal&quot; within 14 days. We review appeals
        within 5 business days and reply by email with a final decision.
        Content involving child sexual exploitation, trafficking, or illegal
        activity is not eligible for reinstatement.
      </p>

      <p className="text-xs">Last updated: November 16, 2026</p>
    </LegalPageShell>
  )
}
