/**
 * Member-facing Identity copy for the configured Stripe flow:
 * document check + matching selfie. No id_number, address, phone, or email check.
 */
export const STRIPE_IDENTITY_ENABLED_CHECKS = {
  document: true,
  selfie: true,
  id_number: false,
  address: false,
  phone: false,
  email: false,
} as const

export const STRIPE_IDENTITY_URL = 'https://stripe.com/identity'
export const STRIPE_PRIVACY_URL = 'https://stripe.com/privacy'
export const STRIPE_PRIVACY_EMAIL = 'privacy@stripe.com'

export const IDENTITY_VERIFICATION_HEADING =
  'Identity verification, privacy, and safety'

export const IDENTITY_VERIFICATION_INTRO =
  'Huntsville Social Club is built around real, local connection. Identity verification helps us reduce fake profiles, impersonation, scams, and unwanted contact so members can participate more confidently.'

export const IDENTITY_VERIFICATION_PURPOSE =
  'Your verification document is used only to confirm that you are a real person and that the information on your application is accurate. It is not displayed on your profile, shared with other members, used for marketing, or used to make your private information visible to anyone.'

export const IDENTITY_VERIFICATION_ACCESS =
  'Your document is processed by our identity-verification provider, Stripe Identity. Authorized Huntsville Social Club administrators may review the verification result when needed to complete your application. Document images, selfies, and extracted identification details are not stored in our database or shown in application review. Other members, event hosts, businesses, and the public cannot see it.'

export const IDENTITY_VERIFICATION_SAFETY =
  'We understand that safety and privacy matter, especially when meeting new people locally. Your home address, driver’s license number, document number, and other sensitive identification details are never shown on your public or member profile.'

export const IDENTITY_VERIFICATION_CONCERN_BEFORE =
  'If you have a privacy concern before submitting, contact'

export const IDENTITY_VERIFICATION_CONCERN_AFTER =
  'and we will help you understand what is required.'

export const IDENTITY_VERIFICATION_RETENTION =
  'We keep verification information only as long as needed to complete verification, maintain the safety of the community, and meet applicable legal or operational requirements. If you have questions about verification or your information, contact'

export const IDENTITY_VERIFICATION_RETENTION_AFTER = 'before submitting.'

export const IDENTITY_BEFORE_YOU_START_HEADING = 'Before you start'

export const IDENTITY_BEFORE_YOU_START_ITEMS = [
  'Have a valid, unexpired government-issued photo ID ready.',
  'Use a phone or device with a camera in good, even lighting.',
  'Submit clear images without glare, blur, cropping, or covered information.',
  'Do not block, redact, or alter any part of your ID. Stripe needs a complete, readable document to verify it.',
  'If asked for a selfie, remove sunglasses, masks, or anything that blocks your face.',
  'Stripe will request your consent before collecting or using biometric information where applicable.',
] as const

export const IDENTITY_VERIFICATION_FAQS = [
  {
    question: 'How does identity verification work?',
    answer:
      'Huntsville Social Club works with Stripe Identity to conduct identity verification online. Stripe asks you to capture images of a valid government-issued photo ID and may ask you to take a selfie. Stripe reviews the ID to help confirm that it is authentic and compares the selfie with the photo on the ID to help confirm that the document belongs to you. Stripe requests consent before collecting or using biometric information where applicable. Huntsville Social Club uses the verification result to help review your application and support a safer, more trusted member community.',
  },
  {
    question: 'Why am I asked to verify my identity?',
    answer:
      'Verification helps Huntsville Social Club maintain a community of real people and reduce fake profiles, impersonation, scams, and unwanted contact. It is one part of our application-review process and helps us make local connection safer and more trustworthy.',
  },
  {
    question: 'What should I do for a successful verification?',
    answer:
      'Use a valid, unexpired government-issued photo ID. Capture clear, well-lit images without glare, shadows, blur, cropping, or covered details. If a selfie is requested, remove sunglasses, masks, or anything that blocks your face and use even lighting.',
  },
  {
    question: 'Who has access to my verification data?',
    answer:
      'Stripe Identity processes the information you submit through the verification flow. Authorized Huntsville Social Club administrators may review verification results and limited information needed to complete your application. Other members, event hosts, businesses, and the public cannot see your verification document or sensitive verification details. Stripe may use trusted service providers to help verify identity in accordance with its Privacy Policy. Huntsville Social Club does not display your verification document, home address, driver’s license number, document number, or similar sensitive details on your profile.',
  },
  {
    question: 'Why was my verification rejected?',
    answer:
      'A verification may not be completed if the ID image is unclear, the document is expired or unsupported, the image is cropped, blurred, has glare, contains covered details, or Stripe cannot confirm that the selfie matches the ID. A result does not always mean that you did anything wrong. If you believe there was an error or need help understanding the next step, contact',
  },
  {
    question: 'Can I get verified using a different method?',
    answer:
      'If you have a privacy, accessibility, or consent concern about the verification process, contact',
  },
  {
    question: 'How can I access or delete my verification data?',
    answer:
      'To request access to or deletion of verification-related information handled by Huntsville Social Club, email',
  },
] as const

export const IDENTITY_FAQ_ALTERNATIVE_REST =
  'before submitting. We will explain the available options and any requirements for completing your application. Availability of an alternative method may depend on the information needed to safely verify your application.'

export const IDENTITY_FAQ_REJECTION_REST =
  'A result does not always mean that you did anything wrong. If you believe there was an error or need help understanding the next step, contact'

export const IDENTITY_FAQ_DELETION_SUBJECT = 'Data Deletion Request'

export const PRIVACY_IDENTITY_HEADING = 'Identity Verification'

export const PRIVACY_IDENTITY_PARAGRAPHS = [
  'Huntsville Social Club uses Stripe Identity to help verify the identity of applicants and support fraud prevention, community safety, and application review.',
  'Stripe may collect and process information such as your name, date of birth, government-issued identification information, identity-document images, selfie images, device information, and cookies or similar technologies used in connection with Stripe’s services.',
  'Stripe may perform document-authenticity and selfie-to-ID matching checks. Where Stripe collects biometric information, Stripe requests consent before collecting and using it.',
  'Huntsville Social Club receives and uses verification results and limited verification information as needed to review an application, help prevent fraud, protect community safety, and administer our services. We do not display verification documents or sensitive verification details on member profiles, and we do not use verification data for marketing.',
  'Stripe processes verification information as our service provider and may use trusted verification providers in accordance with Stripe’s Privacy Policy. Stripe may also process information to operate, improve, authenticate, secure, and prevent fraud in its services.',
  'We retain verification-related information only for as long as reasonably necessary for verification, community safety, legal compliance, dispute resolution, fraud prevention, and legitimate operational needs. When applicable and appropriate, Huntsville Social Club may request redaction of a Stripe Identity VerificationSession.',
] as const
