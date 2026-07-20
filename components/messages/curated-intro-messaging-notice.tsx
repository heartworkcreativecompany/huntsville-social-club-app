import Link from 'next/link'
import Card from '@/components/ui/card'

export default function CuratedIntroMessagingNotice() {
  return (
    <Card padding="sm" className="mb-6">
      <p className="text-sm font-medium text-foreground">
        Curated intro messaging
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        This private conversation is included with your accepted curated match
        message request. You can read and reply here without upgrading. Broader
        member messaging still requires Inner Circle or Elite Circle.
      </p>
      <Link
        href="/upgrade"
        className="mt-3 inline-flex text-sm font-medium text-accent underline"
      >
        View memberships
      </Link>
    </Card>
  )
}
