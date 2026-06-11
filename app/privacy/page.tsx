import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p>
        Huntsville Social Club (&quot;we,&quot; &quot;us&quot;) respects your
        privacy. This policy describes what we collect, why we collect it, and
        how we protect member information.
      </p>

      <h2 className="text-display text-lg font-medium text-foreground">
        What we collect
      </h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Account information (email, authentication credentials)</li>
        <li>Membership application responses you submit</li>
        <li>Profile photos uploaded for membership review</li>
        <li>Event RSVPs and host activity within the club app</li>
      </ul>

      <h2 className="text-display text-lg font-medium text-foreground">
        How we use information
      </h2>
      <p>
        We use your information to operate membership review, verified member
        discovery, events, and club communications. Private fields (legal name,
        date of birth, full address, employer) are used for verification and are
        not shown in public member views.
      </p>

      <h2 className="text-display text-lg font-medium text-foreground">
        Photo storage
      </h2>
      <p>
        Application photos are stored in private storage. Signed URLs are
        generated at view time and are never stored in our database.
      </p>

      <h2 className="text-display text-lg font-medium text-foreground">
        Contact
      </h2>
      <p>
        Privacy questions:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
      </p>

      <p className="text-xs">Last updated: May 2026</p>
    </LegalPageShell>
  )
}
