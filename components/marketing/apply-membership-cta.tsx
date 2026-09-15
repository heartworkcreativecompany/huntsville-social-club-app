import Link from 'next/link'
import { APPLY_FOR_FREE_MEMBERSHIP_CTA } from '@/lib/marketing-home-copy'
import { marketingButtonPrimaryClassName } from '@/lib/event-labels'

export default function ApplyMembershipCta({
  href,
  className = '',
  label = APPLY_FOR_FREE_MEMBERSHIP_CTA,
}: {
  href: string
  className?: string
  label?: string
}) {
  return (
    <Link href={href} className={`${marketingButtonPrimaryClassName} ${className}`}>
      {label}
    </Link>
  )
}
