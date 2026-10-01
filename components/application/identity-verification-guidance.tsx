import Link from 'next/link'
import {
  IDENTITY_BEFORE_YOU_START_HEADING,
  IDENTITY_BEFORE_YOU_START_ITEMS,
  IDENTITY_FAQ_ALTERNATIVE_REST,
  IDENTITY_FAQ_DELETION_SUBJECT,
  IDENTITY_VERIFICATION_ACCESS,
  IDENTITY_VERIFICATION_CONCERN_AFTER,
  IDENTITY_VERIFICATION_CONCERN_BEFORE,
  IDENTITY_VERIFICATION_FAQS,
  IDENTITY_VERIFICATION_HEADING,
  IDENTITY_VERIFICATION_INTRO,
  IDENTITY_VERIFICATION_PURPOSE,
  IDENTITY_VERIFICATION_RETENTION,
  IDENTITY_VERIFICATION_RETENTION_AFTER,
  IDENTITY_VERIFICATION_SAFETY,
  STRIPE_IDENTITY_URL,
  STRIPE_PRIVACY_EMAIL,
  STRIPE_PRIVACY_URL,
} from '@/lib/identity-verification-copy'
import { SUPPORT_EMAIL } from '@/lib/site'

const textLinkClassName = 'text-accent underline'

function SupportEmailLink() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={textLinkClassName}>
      {SUPPORT_EMAIL}
    </a>
  )
}

function StripeIdentityLink() {
  return (
    <a
      href={STRIPE_IDENTITY_URL}
      target="_blank"
      rel="noreferrer"
      className={textLinkClassName}
    >
      Stripe Identity
    </a>
  )
}

function StripePrivacyLink({ children }: { children: string }) {
  return (
    <a
      href={STRIPE_PRIVACY_URL}
      target="_blank"
      rel="noreferrer"
      className={textLinkClassName}
    >
      {children}
    </a>
  )
}

export function IdentityVerificationIntro() {
  const access = IDENTITY_VERIFICATION_ACCESS.split('Stripe Identity')

  return (
    <div className="grid gap-3 text-sm leading-relaxed text-muted-foreground">
      <h4 className="text-display text-base font-semibold text-foreground">
        {IDENTITY_VERIFICATION_HEADING}
      </h4>
      <p>{IDENTITY_VERIFICATION_INTRO}</p>
      <p>{IDENTITY_VERIFICATION_PURPOSE}</p>
      <p>
        {access[0]}
        <StripeIdentityLink />
        {access[1]}
      </p>
      <p>{IDENTITY_VERIFICATION_SAFETY}</p>
      <p>
        {IDENTITY_VERIFICATION_CONCERN_BEFORE} <SupportEmailLink />{' '}
        {IDENTITY_VERIFICATION_CONCERN_AFTER}
      </p>
      <p>
        {IDENTITY_VERIFICATION_RETENTION} <SupportEmailLink />{' '}
        {IDENTITY_VERIFICATION_RETENTION_AFTER}
      </p>
      <p>
        You can also review our{' '}
        <Link href="/privacy" className={textLinkClassName}>
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href="/data-deletion" className={textLinkClassName}>
          Data Deletion Instructions
        </Link>
        .
      </p>
    </div>
  )
}

export function IdentityVerificationPrepare() {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <h4 className="text-sm font-semibold text-foreground">
        {IDENTITY_BEFORE_YOU_START_HEADING}
      </h4>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        {IDENTITY_BEFORE_YOU_START_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function IdentityVerificationFaq() {
  return (
    <div className="grid gap-2">
      {IDENTITY_VERIFICATION_FAQS.map((item) => (
        <details
          key={item.question}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
        >
          <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            {item.question}
          </summary>
          <div className="mt-2 leading-relaxed">{faqAnswer(item.question, item.answer)}</div>
        </details>
      ))}
    </div>
  )
}

function faqAnswer(question: string, answer: string) {
  if (question === 'Who has access to my verification data?') {
    const [before, after] = answer.split('Privacy Policy')
    return (
      <p>
        {before}
        <StripePrivacyLink>Privacy Policy</StripePrivacyLink>
        {after}
      </p>
    )
  }

  if (question === 'Why was my verification rejected?') {
    return (
      <p>
        {answer} <SupportEmailLink />.
      </p>
    )
  }

  if (question === 'Can I get verified using a different method?') {
    return (
      <p>
        {answer} <SupportEmailLink /> {IDENTITY_FAQ_ALTERNATIVE_REST}
      </p>
    )
  }

  if (question === 'How can I access or delete my verification data?') {
    return (
      <>
        <p>
          {answer} <SupportEmailLink /> with the subject line “
          {IDENTITY_FAQ_DELETION_SUBJECT}.” You can also review our{' '}
          <Link href="/data-deletion" className={textLinkClassName}>
            Data Deletion Instructions
          </Link>
          .
        </p>
        <p className="mt-2">
          Because Stripe Identity processes verification information, you may
          also contact Stripe at{' '}
          <a href={`mailto:${STRIPE_PRIVACY_EMAIL}`} className={textLinkClassName}>
            {STRIPE_PRIVACY_EMAIL}
          </a>{' '}
          regarding data held by Stripe or to withdraw applicable consent.
          Stripe’s handling of verification data is governed by its{' '}
          <StripePrivacyLink>Privacy Policy</StripePrivacyLink>.
        </p>
      </>
    )
  }

  return <p>{answer}</p>
}
