import MemberTrustBadges from '@/components/members/member-trust-badges'
import {
  directoryCardBadges,
  profilePageBadges,
  type DirectoryMember,
} from '@/lib/members-discovery'

export function MemberCardBadges({ member }: { member: DirectoryMember }) {
  return <MemberTrustBadges badges={directoryCardBadges(member)} />
}

export function MemberProfileBadges({ member }: { member: DirectoryMember }) {
  const { tier } = profilePageBadges(member)
  return <MemberTrustBadges badges={[tier]} />
}
