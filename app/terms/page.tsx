import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p>
        By creating an account or using Huntsville Social Club, you agree to
        these terms. The club is a private membership community—not a public
        social network.
      </p>

      <h2 className="text-display text-lg font-medium text-foreground">
        Membership
      </h2>
      <p>
        Access to full club features requires application review and approval.
        We may approve, decline, or request more information at our discretion.
      </p>

      <h2 className="text-display text-lg font-medium text-foreground">
        Conduct
      </h2>
      <p>
        Members agree to our Code of Conduct, provide accurate application
        information, and participate respectfully in events and discovery.
      </p>

      <h2 className="text-display text-lg font-medium text-foreground">
        Content
      </h2>
      <p>
        You retain ownership of content you submit. You grant the club a license
        to display approved profile information to verified members and
        administrators for club operations.
      </p>

      <h2 className="text-display text-lg font-medium text-foreground">
        Contact
      </h2>
      <p>
        Terms questions:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
      </p>

      <p className="text-xs">Last updated: May 2026</p>
    </LegalPageShell>
  )
}
