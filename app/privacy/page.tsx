import Link from 'next/link'
import LegalPageShell from '@/components/legal/legal-page-shell'
import {
  PRIVACY_IDENTITY_HEADING,
  PRIVACY_IDENTITY_PARAGRAPHS,
  STRIPE_IDENTITY_URL,
  STRIPE_PRIVACY_EMAIL,
  STRIPE_PRIVACY_URL,
} from '@/lib/identity-verification-copy'
import { SUPPORT_EMAIL } from '@/lib/site'
import {
  PRIVACY_EMAIL_SECTION_TITLE,
  privacyEmailSectionParagraphs,
} from '@/lib/email-consent'
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

      <h2 id="email" className="text-display text-lg font-semibold">
        {PRIVACY_EMAIL_SECTION_TITLE}
      </h2>
      {privacyEmailSectionParagraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}

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
        {PRIVACY_IDENTITY_HEADING}
      </h2>
      {PRIVACY_IDENTITY_PARAGRAPHS.map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}
      <p>
        For more information, review{' '}
        <a
          href={STRIPE_IDENTITY_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          Stripe Identity
        </a>{' '}
        and{' '}
        <a
          href={STRIPE_PRIVACY_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          Stripe’s Privacy Policy
        </a>
        .
      </p>
      <p>
        You may submit a privacy or deletion request by emailing{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>{' '}
        or following our{' '}
        <Link href="/data-deletion" className="text-accent underline">
          Data Deletion Instructions
        </Link>
        . You may also contact Stripe at{' '}
        <a
          href={`mailto:${STRIPE_PRIVACY_EMAIL}`}
          className="text-accent underline"
        >
          {STRIPE_PRIVACY_EMAIL}
        </a>{' '}
        regarding information Stripe holds and applicable consent choices.
      </p>

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
