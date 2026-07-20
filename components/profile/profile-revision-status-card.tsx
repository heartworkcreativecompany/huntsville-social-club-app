import Card from '@/components/ui/card'
import type { ProfileRevisionStatus } from '@/lib/profile-revision'

type ProfileRevisionStatusCardProps = {
  status: ProfileRevisionStatus
  submittedAt: string | null
  adminNotes: string | null
  changedFields: string[]
}

export default function ProfileRevisionStatusCard({
  status,
  submittedAt,
  adminNotes,
  changedFields,
}: ProfileRevisionStatusCardProps) {
  if (status === 'none') return null

  const isPending = status === 'pending'

  return (
    <Card
      className={
        isPending
          ? 'border-warning/40 bg-warning/5'
          : 'border-danger/30 bg-danger/5'
      }
    >
      <p className="eyebrow">{isPending ? 'Pending review' : 'Revision declined'}</p>
      <h2 className="text-display mt-1 text-lg font-semibold">
        {isPending
          ? 'Your profile changes are awaiting staff review'
          : 'Your last profile revision was not approved'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {isPending
          ? 'Your current public profile stays live until staff approves these edits.'
          : 'Your approved public profile was not changed. You can edit and submit again below.'}
      </p>
      {submittedAt && isPending ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Submitted {new Date(submittedAt).toLocaleString()}
        </p>
      ) : null}
      {changedFields.length > 0 && isPending ? (
        <p className="mt-2 text-sm">
          <span className="font-medium text-foreground">Pending fields: </span>
          {changedFields.join(', ')}
        </p>
      ) : null}
      {adminNotes && !isPending ? (
        <p className="mt-3 text-sm text-foreground">
          <span className="font-medium">Staff note: </span>
          {adminNotes}
        </p>
      ) : null}
    </Card>
  )
}
