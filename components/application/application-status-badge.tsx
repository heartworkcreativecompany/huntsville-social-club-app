import Badge from '@/components/ui/badge'
import {
  applicationStatusLabel,
  statusBadgeVariant,
  type ApplicationStatus,
} from '@/lib/application'

export default function ApplicationStatusBadge({
  status,
}: {
  status: ApplicationStatus
}) {
  return (
    <Badge variant={statusBadgeVariant(status)}>
      {applicationStatusLabel(status)}
    </Badge>
  )
}
