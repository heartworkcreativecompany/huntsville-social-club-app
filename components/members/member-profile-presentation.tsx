import MemberProfileDetailLayout from '@/components/members/member-profile-detail-layout'
import MemberProfileDetailsPanel from '@/components/members/member-profile-details-panel'
import MemberPublicDetails from '@/components/members/member-public-details'
import MemberVouchForm from '@/components/members/member-vouch-form'
import MemberVouchSummary from '@/components/members/member-vouch-summary'
import type { DirectoryMember } from '@/lib/members-discovery'
import type { ApplicationPublicProfileDetails } from '@/lib/application-profile-preview'
import type { VouchSummary, VouchType } from '@/lib/member-vouches'

export default function MemberProfilePresentation({
  member,
  isCurrentUser = false,
  limited = true,
  details,
  banner,
  footer,
  vouchSummary,
  viewerVouches,
  canVouch = false,
}: {
  member: DirectoryMember
  isCurrentUser?: boolean
  limited?: boolean
  details?: ApplicationPublicProfileDetails | null
  banner?: React.ReactNode
  footer?: React.ReactNode
  vouchSummary?: VouchSummary | null
  viewerVouches?: { id: string; vouch_type: VouchType; status: string }[]
  canVouch?: boolean
}) {
  return (
    <MemberProfileDetailLayout
      memberId={member.id}
      photos={member.photos}
      banner={banner}
      footer={footer}
      details={
        <div className="grid gap-4">
          <MemberProfileDetailsPanel
            member={member}
            isCurrentUser={isCurrentUser}
            limited={limited}
          />
          {details ? (
            <MemberPublicDetails details={details} compact omitHeaderFields />
          ) : null}
          {vouchSummary && vouchSummary.total > 0 ? (
            <MemberVouchSummary summary={vouchSummary} />
          ) : null}
          {canVouch && viewerVouches ? (
            <MemberVouchForm
              memberId={member.id}
              existingVouches={viewerVouches}
            />
          ) : null}
        </div>
      }
    />
  )
}
