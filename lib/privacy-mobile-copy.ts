/**
 * Privacy Policy copy for the Mobile Numbers and Text Messages section.
 * Kept as shared constants so Twilio A2P review language can be tested.
 */

import { PRIVACY_POLICY_PROPOSED_PUBLICATION_DATE } from '@/lib/email-consent'
import { SUPPORT_EMAIL } from '@/lib/site'

export const PRIVACY_MOBILE_SECTION_TITLE = 'Mobile Numbers and Text Messages'

export const PRIVACY_MOBILE_NO_SHARE_STATEMENT =
  'Mobile opt-in data and consent will not be shared with third parties or affiliates for their own marketing or promotional purposes.'

export const privacyMobileSectionParagraphs = [
  'We collect a mobile phone number only when you choose phone verification.',
  'We use that number to send a verification code you request. A verified phone number is optional for membership approval.',
  'Huntsville Social Club no longer offers optional account-notification or marketing text messages. Older SMS consent and opt-out records are kept and are not used as email consent. If you previously agreed to those texts, you can still reply STOP to opt out or HELP for help.',
  PRIVACY_MOBILE_NO_SHARE_STATEMENT,
  `Huntsville Social Club may use service providers strictly to operate its communications, membership, payment, hosting, verification, or customer-support services, but only as needed to provide services on our behalf and not for those providers’ independent marketing purposes.`,
  `Mobile numbers and consent records are retained only as needed to operate the service, comply with legal obligations, resolve disputes, and enforce agreements. The Club uses reasonable safeguards to protect personal information, but no method of transmission or storage is completely secure.`,
  `Privacy questions about mobile numbers or text messages: ${SUPPORT_EMAIL}.`,
] as const

export const PRIVACY_POLICY_LAST_UPDATED = PRIVACY_POLICY_PROPOSED_PUBLICATION_DATE
