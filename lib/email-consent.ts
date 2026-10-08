/**
 * Signup email consent.
 *
 * Essential acknowledgement and marketing opt-in are separate. The database
 * writes timestamps, source, and version. Clients send only the two booleans.
 *
 * Source `auth_signup` means the Auth user metadata contained JSON true at
 * creation. It is not proof a checkbox was rendered.
 */

export const ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_VERSION = '2026-10-07-essential-email'

export const EMAIL_MARKETING_CONSENT_VERSION = '2026-10-07-email-marketing'

export const EMAIL_CONSENT_SOURCE_AUTH_SIGNUP = 'auth_signup' as const

export const ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_METADATA_KEY =
  'essential_email_acknowledgement' as const

export const EMAIL_MARKETING_OPT_IN_METADATA_KEY = 'email_marketing_opt_in' as const

export const ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_LABEL =
  'I understand and agree that Huntsville Social Club will send emails necessary to manage my application, account, and membership.'

export const EMAIL_MARKETING_OPT_IN_LABEL =
  'Email me Huntsville Social Club news, event announcements, and offers. Optional—you can unsubscribe at any time.'

export const ESSENTIAL_EMAIL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE =
  'Confirm that Huntsville Social Club may send emails needed to manage your application, account, and membership.'

/** Public privacy copy. Does not promise that marketing unsubscribe leaves essential mail untouched. */
export const PRIVACY_EMAIL_SECTION_TITLE = 'Email'

export const privacyEmailSectionParagraphs = [
  'We send emails needed to manage your application, account, and membership, such as confirmation, application status, and account security. Creating an account requires you to acknowledge these messages. That acknowledgement is not a request for news or offers.',
  'You may separately choose: “Email me Huntsville Social Club news, event announcements, and offers.” That choice is optional. If you do not select it, we do not record a marketing opt-in. You can unsubscribe from news, announcements, and offers.',
] as const

export const PRIVACY_POLICY_PROPOSED_PUBLICATION_DATE = 'October 7, 2026'

export type SignupEmailConsentMetadata = {
  essential_email_acknowledgement: boolean
  email_marketing_opt_in: boolean
}

/** Only the two booleans. No client timestamp, source, or version. */
export function signupEmailConsentMetadata(input: {
  essentialAcknowledged: boolean
  marketingOptIn: boolean
}): SignupEmailConsentMetadata {
  return {
    essential_email_acknowledgement: input.essentialAcknowledged === true,
    email_marketing_opt_in: input.marketingOptIn === true,
  }
}
