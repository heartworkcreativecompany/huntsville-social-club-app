import MemberTrustBadges from '@/components/members/member-trust-badges'
import MemberRecognitionBadges from '@/components/members/member-recognition-badges'
import {
  directoryCardBadges,
  profilePageBadges,
  type DirectoryMember,
} from '@/lib/members-discovery'

export function MemberCardBadges({ member }: { member: DirectoryMember }) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1.5">
      <MemberTrustBadges badges={directoryCardBadges(member)} />
      <MemberRecognitionBadges badges={member.recognitionBadges} />
    </div>
  )
}

export function MemberProfileBadges({ member }: { member: DirectoryMember }) {
  const { tier } = profilePageBadges(member)
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1.5">
      <MemberTrustBadges badges={[tier]} />
      <MemberRecognitionBadges badges={member.recognitionBadges} />
    </div>
  )
}
