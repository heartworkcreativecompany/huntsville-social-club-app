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
        Be 18 or older
      </h2>
      <p>
        Members must be at least 18 years old. Please do not apply or use the
        club if you are under 18.
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
        What is not allowed
      </h2>
      <p>
        Huntsville Social Club is a place to meet in person. It is not a sexual
        or &quot;hook-up&quot; service. Do not post, send, or ask for any of
        the following:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Sexually explicit profile content or photos</li>
        <li>Child sexual exploitation or abuse</li>
        <li>Sexual violence</li>
        <li>
          Non-consensual content, including private photos or messages the
          other person did not agree to
        </li>
        <li>
          Soliciting or facilitating commercial sex, human trafficking, or sex
          trafficking
        </li>
        <li>Scams, fraud, or requests for money from another member</li>
        <li>Impersonation or fake profiles</li>
        <li>Harassment</li>
      </ul>

      <h2 className="text-display text-lg font-semibold">
        Enforcement
      </h2>
      <p>
        If you break these standards, we may warn you, suspend your messaging,
        or remove you permanently. Repeat violations escalate to a stronger
        response. Members who are removed may not reapply.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Report concerns
      </h2>
      <p>
        If you experience or witness a problem, use the Report option in any
        conversation, use the Block option, or email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <p>
        We review reports within 2 business days. We review safety threats
        right away.
      </p>

      <p className="text-xs">Last updated: November 11, 2026</p>
    </LegalPageShell>
  )
}
