import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'

export default function CodeOfConductPage() {
  return (
    <LegalPageShell title="Code of Conduct">
      <p>
        Huntsville Social Club is built on trust, discretion, and showing up
        well. Every member agrees to these expectations.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Be respectful
      </h2>
      <p>
        Treat fellow members, hosts, and administrators with courtesy. Harassment,
        discrimination, or aggressive behavior is not tolerated.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Be honest
      </h2>
      <p>
        Provide accurate application information and represent yourself
        authentically in your profile and at events.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Protect privacy
      </h2>
      <p>
        Do not share other members&apos; private contact details, photos, or
        personal information outside the club without consent.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Report concerns
      </h2>
      <p>
        Contact{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>{' '}
        if you experience or witness conduct that violates these standards.
      </p>

      <p className="text-xs">Last updated: May 2026</p>
    </LegalPageShell>
  )
}
