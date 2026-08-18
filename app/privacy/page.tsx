import Link from 'next/link'
import LegalPageShell from '@/components/legal/legal-page-shell'
import { SUPPORT_EMAIL } from '@/lib/site'
import {
  PRIVACY_MOBILE_SECTION_TITLE,
  PRIVACY_POLICY_LAST_UPDATED,
  privacyMobileSectionParagraphs,
} from '@/lib/privacy-mobile-copy'

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p>
        Huntsville Social Club (&quot;we,&quot; &quot;us&quot;) respects your
        privacy. This policy describes what we collect, why we collect it, and
        how we protect member information.
      </p>

      <h2 className="text-display text-lg font-semibold">
        What we collect
      </h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Account information (email, authentication credentials)</li>
        <li>Membership application responses you submit</li>
        <li>Profile photos uploaded for membership review</li>
        <li>Event RSVPs and host activity within the club app</li>
        <li>
          Mobile phone numbers when provided for verification or optional text
          messaging
        </li>
      </ul>

      <h2 className="text-display text-lg font-semibold">
        How we use information
      </h2>
      <p>
        We use your information to operate membership review, verified member
        discovery, events, and club communications. Private fields (legal name,
        date of birth, full address, employer) are used for verification and are
        not shown in public member views.
      </p>

      <h2 className="text-display text-lg font-semibold">
        Photo storage
      </h2>
      <p>
        Application photos are stored in private storage. Signed URLs are
        generated at view time and are never stored in our database.
      </p>

      <h2
        id="mobile-numbers-and-text-messages"
        className="text-display text-lg font-semibold"
      >
        {PRIVACY_MOBILE_SECTION_TITLE}
      </h2>
      {privacyMobileSectionParagraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}

      <h2 className="text-display text-lg font-semibold">
        Contact
      </h2>
      <p>
        Privacy questions:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
      </p>

      <p className="text-xs">
        Last updated: {PRIVACY_POLICY_LAST_UPDATED}. Public policy URL:{' '}
        <Link href="/privacy" className="text-accent underline">
          /privacy
        </Link>
        .
      </p>
    </LegalPageShell>
  )
}
