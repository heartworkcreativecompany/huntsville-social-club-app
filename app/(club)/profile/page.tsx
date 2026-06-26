import Link from 'next/link'
import { redirect } from 'next/navigation'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import MemberProfileCard from '@/components/members/member-profile-card'
import MemberBillingStatus from '@/components/members/member-billing-status'
import ProfileStrengthModule from '@/components/profile/profile-strength-module'
import VerificationStatusModule from '@/components/profile/verification-status-module'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import { buildDirectoryMember } from '@/lib/members-discovery'
import { photosFromApplicationDraft } from '@/lib/member-photos'
import { computeProfileCompletion } from '@/lib/profile-completion'
import { getViewer } from '@/lib/viewer'
import ProfileForm from '@/app/(club)/members/profile-form'

export default async function YourProfilePage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const profile = viewer.profile
  const draft = mergeProfileIntoDraft(profile)
  const completion = computeProfileCompletion(profile, draft)

  const currentMember = profile
    ? buildDirectoryMember({
        ...profile,
        application_status: profile.application_status,
        email: profile.email ?? viewer.email,
      })
    : null

  if (currentMember) {
    currentMember.photos = photosFromApplicationDraft(profile?.application_draft)
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Your Profile"
        description="Manage how you show up in the club — photos, details, verification, and membership status."
        actions={<ApplicationStatusBadge status={viewer.applicationStatus} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="space-y-6">
          {currentMember ? (
            <Card>
              <p className="eyebrow">Public preview</p>
              <h2 className="text-display mt-1 text-lg font-semibold">
                How members see you
              </h2>
              <div className="mt-4">
                <MemberProfileCard
                  member={currentMember}
                  isCurrentUser
                  href={`/members/${viewer.userId}`}
                />
              </div>
            </Card>
          ) : null}

          <ProfileForm
            displayName={draft.profile.displayName || profile?.full_name || ''}
            bio={draft.prompts.hopingToMeet || profile?.membership_intent || ''}
            locationArea={
              draft.location.neighborhoodOrArea || profile?.location_area || ''
            }
          />
        </section>

        <aside className="space-y-6">
          <ProfileStrengthModule
            percent={completion.percent}
            items={completion.items}
          />

          {currentMember ? (
            <VerificationStatusModule
              applicationStatus={viewer.applicationStatus}
              member={currentMember}
              approvalGatesRaw={profile?.approval_gates}
            />
          ) : null}

          <MemberBillingStatus billingRaw={profile?.membership_billing} />
        </aside>
      </div>
    </>
  )
}
