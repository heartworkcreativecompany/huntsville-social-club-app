import Card from '@/components/ui/card'
import { MESSAGING_SUSPENDED_MEMBER_MESSAGE } from '@/lib/messaging-suspension'

export default function MessagingSuspendedNotice() {
  return (
    <Card className="mb-6 border-warning/30 bg-warning-soft/30" padding="sm">
      <p className="text-sm font-medium text-foreground">Messaging suspended</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {MESSAGING_SUSPENDED_MEMBER_MESSAGE}
      </p>
    </Card>
  )
}
