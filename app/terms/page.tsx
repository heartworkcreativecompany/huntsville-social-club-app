import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p>
        By creating an account or using Huntsville Social Club, you agree to
        these terms. The club is a private membership community, not a public
        social network.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Membership
      </h2>
      <p>
        Access to full club features requires application review and approval.
        We may approve, decline, or request more information at our discretion.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Conduct
      </h2>
      <p>
        Members agree to our Code of Conduct, provide accurate application
        information, and participate respectfully in events and discovery.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Content
      </h2>
      <p>
        You retain ownership of content you submit. You grant the club a license
        to display approved profile information to verified members and
        administrators for club operations.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Acceptable Use
      </h2>
      <p>Members must be at least 18 years old.</p>
      <p>The following are prohibited:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Sexually explicit profile content or photos</li>
        <li>Child sexual exploitation or abuse</li>
        <li>Sexual violence</li>
        <li>Non-consensual content</li>
        <li>
          Soliciting or facilitating commercial sex, human trafficking, or sex
          trafficking
        </li>
        <li>Scams, fraud, or requests for money</li>
        <li>Impersonation or fake profiles</li>
        <li>Harassment</li>
      </ul>
      <p>
        Violations lead to content removal, messaging suspension, or permanent
        removal. Removed members may not reapply.
      </p>
      <p>
        We report suspected illegal activity to law enforcement, including the
        National Center for Missing and Exploited Children (NCMEC) for any
        child exploitation, and we respond to valid legal requests.
      </p>
      <p>
        Huntsville Social Club is not a sexual or &quot;hook-up&quot; service.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Contact
      </h2>
      <p>
        Terms questions:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
      </p>

      <p className="text-xs">Last updated: November 11, 2026</p>
    </LegalPageShell>
  )
}
