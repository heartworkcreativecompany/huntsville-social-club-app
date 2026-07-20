import Card from '@/components/ui/card'
import MemberPhotoDisplay from '@/components/members/member-photo-display'
import type { ApplicationPhoto } from '@/lib/application'

export default function ProfilePendingPhotosCard({
  memberId,
  livePhotos,
  pendingPhotos,
}: {
  memberId: string
  livePhotos: ApplicationPhoto[]
  pendingPhotos: ApplicationPhoto[]
}) {
  return (
    <Card className="border-warning/40 bg-warning/5">
      <p className="eyebrow">Pending photos</p>
      <h2 className="text-display mt-1 text-lg font-semibold">
        Photo changes awaiting review
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Other members still see your approved live photos until staff approves
        these updates.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Live (public)
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {livePhotos.map((photo) => (
              <li key={photo.id}>
                <MemberPhotoDisplay
                  memberId={memberId}
                  photo={photo}
                  size="compact"
                  showPrimaryBadge={photo.isPrimary}
                />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            Pending review
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {pendingPhotos.map((photo) => (
              <li key={photo.id}>
                <MemberPhotoDisplay
                  memberId={memberId}
                  photo={photo}
                  size="compact"
                  showPrimaryBadge={photo.isPrimary}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}
