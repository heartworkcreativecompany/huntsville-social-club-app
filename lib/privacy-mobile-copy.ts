/**
 * Privacy Policy copy for the Mobile Numbers and Text Messages section.
 * Kept as shared constants so Twilio A2P review language can be tested.
 */

import { SUPPORT_EMAIL } from '@/lib/site'
import { SMS_MARKETING_MAX_MESSAGES_PER_MONTH, SMS_PROGRAM_NAME } from '@/lib/sms-marketing-consent'

export const PRIVACY_MOBILE_SECTION_TITLE = 'Mobile Numbers and Text Messages'

export const PRIVACY_MOBILE_NO_SHARE_STATEMENT =
  'Mobile opt-in data and consent will not be shared with third parties or affiliates for their own marketing or promotional purposes.'

export const privacyMobileSectionParagraphs = [
  `We may collect a member’s mobile phone number when they create or manage an account, complete phone verification, update their profile, or separately opt in to receive text messages.`,
  `We use mobile numbers to deliver requested account-verification codes and, where applicable, account-security or essential membership-service messages. Message frequency for verification and security texts varies based on the member’s actions (for example, when they request a code or take an account-security step).`,
  `If a member separately opts in, ${SMS_PROGRAM_NAME} may send automated recurring text messages about membership activity, event reminders, club updates, and promotions. Recurring marketing and club-update consent is optional. Consent to recurring promotional texts is not a condition of purchasing a membership, joining the club, or using the service. The SMS program name is ${SMS_PROGRAM_NAME}.`,
  `For optional recurring texts, message frequency varies, up to ${SMS_MARKETING_MAX_MESSAGES_PER_MONTH} messages per month. Message and data rates may apply. Members can reply STOP to cancel recurring text messages and HELP for help. Members may also update communication preferences through their account where that option is available.`,
  PRIVACY_MOBILE_NO_SHARE_STATEMENT,
  `Huntsville Social Club may use service providers strictly to operate its communications, membership, payment, hosting, verification, or customer-support services, but only as needed to provide services on our behalf and not for those providers’ independent marketing purposes.`,
  `Mobile numbers and consent records are retained only as needed to operate the service, comply with legal obligations, resolve disputes, and enforce agreements. The Club uses reasonable safeguards to protect personal information, but no method of transmission or storage is completely secure.`,
  `Privacy questions about mobile numbers or text messages: ${SUPPORT_EMAIL}.`,
] as const

export const PRIVACY_POLICY_LAST_UPDATED = 'August 2026'
