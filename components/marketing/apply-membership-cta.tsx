import Link from 'next/link'
import { APPLY_FOR_FREE_MEMBERSHIP_CTA } from '@/lib/marketing-home-copy'
import {
  marketingButtonPrimaryClassName,
  marketingButtonSecondaryClassName,
} from '@/lib/event-labels'

export default function ApplyMembershipCta({
  href,
  className = '',
  label = APPLY_FOR_FREE_MEMBERSHIP_CTA,
  variant = 'primary',
}: {
  href: string
  className?: string
  label?: string
  variant?: 'primary' | 'secondary'
}) {
  const buttonClassName =
    variant === 'secondary'
      ? marketingButtonSecondaryClassName
      : marketingButtonPrimaryClassName

  return (
    <Link href={href} className={`${buttonClassName} ${className}`}>
      {label}
    </Link>
  )
}
