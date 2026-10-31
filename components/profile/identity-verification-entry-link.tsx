import Link from 'next/link'
import {
  ACCOUNT_IDENTITY_VERIFICATION_HREF,
  ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL,
} from '@/lib/account-identity-verification'
import { buttonPrimaryClassName } from '@/lib/event-labels'

export default function IdentityVerificationEntryLink({
  className,
}: {
  className?: string
}) {
  return (
    <Link
      href={ACCOUNT_IDENTITY_VERIFICATION_HREF}
      className={className ?? `${buttonPrimaryClassName} inline-flex`}
    >
      {ACCOUNT_IDENTITY_VERIFICATION_LINK_LABEL}
    </Link>
  )
}
