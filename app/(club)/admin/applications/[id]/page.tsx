import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminClient } from '@/lib/supabase/require-admin-client'
import ApplicationStatusBadge from '@/components/application/application-status-badge'
import Card from '@/components/ui/card'
import EmptyState from '@/components/ui/empty-state'
import { mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import {
  applicationStatusLabel,
  type ApplicationStatus,
} from '@/lib/application'
import {
  adminApplicationAboutRows,
  adminApplicationLookingForLabel,
  adminMemberApplicationDetailSections,
} from '@/lib/admin-application-review'
import { getViewer } from '@/lib/viewer'
import { formatIndustryLabel } from '@/lib/industries'
import AdminApplicationPhotoGallery from '@/components/admin/admin-application-photo-gallery'
import AdminApprovalGates from '@/components/admin/admin-approval-gates'
import AdminBillingStatus from '@/components/admin/admin-billing-status'
import AdminLocalityReview from '@/components/admin/admin-locality-review'
import AdminMemberVouches from '@/components/admin/admin-member-vouches'
import { loadAdminVouchesForMember } from '@/lib/load-member-vouches'
import {
  identityVerificationDisplayLabel,
  parseApprovalGates,
  parseLocalityConfirmation,
  parseMembershipBilling,
} from '@/lib/membership-systems'
import ApplicationReviewActions from '../application-review-actions'
import RemoveMemberButton from '@/components/admin/remove-member-button'

type PageProps = {
  params: Promise<{ id: string }>
}

function formatBool(value: boolean | null): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return '—'
}

export default async function AdminApplicationDetailPage({ params }: PageProps) {
  const { id } = await params
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (viewer.role !== 'admin') {
    redirect('/home')
  }

  const supabase = requireAdminClient()

  const { data: applicant, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, role, application_status, membership_intent, location_area, application_draft, application_submitted_at, application_reviewed_at, verified_at, admin_review_notes, created_at, approval_gates, locality_confirmation, membership_billing, identity_verification_status, identity_verification_session_id, identity_verified_at, identity_verification_last_error'
    )
    .eq('id', id)
    .single()

  if (error || !applicant) {
    return (
      <EmptyState
        title="Application not found"
        description={error?.message ?? 'This profile could not be loaded.'}
        action={
          <Link
            href="/admin/applications"
            className="text-sm font-medium text-accent underline"
          >
            Back to queue
          </Link>
        }
      />
    )
  }

  const status = (applicant.application_status ?? 'draft') as ApplicationStatus
  const draft = mergeProfileIntoDraft(applicant)
  const gates = parseApprovalGates(applicant.approval_gates)
  const locality = parseLocalityConfirmation(applicant.locality_confirmation)
  const billing = parseMembershipBilling(applicant.membership_billing)
  const memberVouches = await loadAdminVouchesForMember(applicant.id)
  const legalName = [draft.profile.firstName, draft.profile.lastName]
    .filter(Boolean)
    .join(' ')
  const aboutRows = adminApplicationAboutRows(draft)
  const includeRemoveMember =
    applicant.id !== viewer.userId && applicant.role !== 'admin'
  const detailSections = adminMemberApplicationDetailSections({
    includeRemoveMember,
  })

  return (
    <>
      <Link
        href="/admin/applications"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to queue
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display text-3xl font-medium text-foreground">
            {draft.profile.displayName ||
              applicant.full_name ||
              applicant.email ||
              'Applicant'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {applicant.email ?? 'No email on file'}
          </p>
        </div>
        <ApplicationStatusBadge status={status} />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        {detailSections.includes('profile_basics') ? (
          <Card>
            <h2 className="text-display text-lg font-semibold">
              Profile basics
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium text-foreground">
                  {applicationStatusLabel(status)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Legal name (private)</dt>
                <dd className="font-medium text-foreground">
                  {legalName || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Display name</dt>
                <dd className="font-medium text-foreground">
                  {draft.profile.displayName || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date of birth (private)</dt>
                <dd className="font-medium text-foreground">
                  {draft.profile.dateOfBirth || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gender</dt>
                <dd className="font-medium text-foreground">
                  {draft.profile.gender || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pronouns</dt>
                <dd className="font-medium text-foreground">
                  {draft.profile.pronouns || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Looking for</dt>
                <dd className="font-medium text-foreground">
                  {adminApplicationLookingForLabel(draft)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Connection types open to</dt>
                <dd className="font-medium text-foreground">
                  {draft.profile.connectionsOpenTo.join(', ') || '—'}
                </dd>
              </div>
            </dl>
          </Card>
        ) : null}

        {detailSections.includes('location') ? (
          <Card>
            <h2 className="text-display text-lg font-semibold">Location</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">
                  City / state / ZIP (private)
                </dt>
                <dd className="font-medium text-foreground">
                  {[
                    draft.location.city,
                    draft.location.state,
                    draft.location.zipCode,
                  ]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Public area</dt>
                <dd className="font-medium text-foreground">
                  {draft.location.neighborhoodOrArea ||
                    applicant.location_area ||
                    '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lives in Huntsville area</dt>
                <dd className="font-medium text-foreground">
                  {formatBool(draft.location.livesInHuntsvilleArea)}
                </dd>
              </div>
              {draft.location.livesInHuntsvilleArea === false ? (
                <div>
                  <dt className="text-muted-foreground">
                    Area connection (private)
                  </dt>
                  <dd className="leading-relaxed text-foreground">
                    {draft.location.localConnection || '—'}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>
        ) : null}

        {detailSections.includes('work_and_interests') ? (
          <Card>
            <h2 className="text-display text-lg font-semibold">
              Work & interests
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Occupation</dt>
                <dd className="font-medium text-foreground">
                  {draft.workAndInterests.occupation || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Industry</dt>
                <dd className="font-medium text-foreground">
                  {formatIndustryLabel(draft.workAndInterests.industry) || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Employer (private)</dt>
                <dd className="font-medium text-foreground">
                  {draft.workAndInterests.employerCompany || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Education</dt>
                <dd className="font-medium text-foreground">
                  {draft.workAndInterests.education || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Interests</dt>
                <dd className="font-medium text-foreground">
                  {draft.workAndInterests.interests.join(', ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lifestyle tags</dt>
                <dd className="font-medium text-foreground">
                  {draft.workAndInterests.lifestyleTags.join(', ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Event interests</dt>
                <dd className="font-medium text-foreground">
                  {draft.workAndInterests.eventInterests.join(', ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Social vibe</dt>
                <dd className="font-medium text-foreground">
                  {draft.workAndInterests.socialVibe || '—'}
                </dd>
              </div>
              {draft.location.socialLink ? (
                <div>
                  <dt className="text-muted-foreground">Social link (private)</dt>
                  <dd className="font-medium break-all text-foreground">
                    {draft.location.socialLink}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>
        ) : null}

        {detailSections.includes('about_you') ? (
          <Card>
            <h2 className="text-display text-lg font-semibold">About you</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              {aboutRows.map((row) => (
                <div key={row.key}>
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="leading-relaxed text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}

        {detailSections.includes('photos') ? (
          <Card className="lg:col-span-2">
            <h2 className="text-display text-lg font-semibold">
              Application photos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Private storage — previews use short-lived signed URLs for admins
              only.
            </p>
            <div className="mt-4">
              <AdminApplicationPhotoGallery
                applicantId={applicant.id}
                photos={draft.photos}
              />
            </div>
          </Card>
        ) : null}

        {detailSections.includes('approval_requirements') ? (
          <Card className="lg:col-span-2">
            <h2 className="text-display text-lg font-semibold">
              Approval requirements
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Required gates must be approved before final membership approval.
              Phone verification is optional and does not block approval.
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">
                  Identity &amp; location status
                </dt>
                <dd className="font-medium text-foreground">
                  {identityVerificationDisplayLabel(
                    applicant.identity_verification_status
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Identity session ID</dt>
                <dd className="font-medium break-all text-foreground">
                  {applicant.identity_verification_session_id ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Identity verified at</dt>
                <dd className="font-medium text-foreground">
                  {applicant.identity_verified_at
                    ? new Date(applicant.identity_verified_at).toLocaleString()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Retry guidance</dt>
                <dd className="font-medium text-foreground">
                  {applicant.identity_verification_last_error ?? '—'}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Stripe Identity updates this status automatically. Document images,
              selfies, and extracted ID values are not stored or shown here.
              Membership approval remains a separate manual action below.
            </p>
            <div className="mt-4">
              <AdminApprovalGates
                applicantId={applicant.id}
                gates={gates}
                identityStripeStatus={applicant.identity_verification_status}
                identityVerifiedAt={applicant.identity_verified_at}
              />
            </div>
          </Card>
        ) : null}

        {detailSections.includes('locality') ? (
          <Card className="lg:col-span-2">
            <h2 className="text-display text-lg font-semibold">
              Locality confirmation (admin)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Trust signal review — not proof of identity. City and ZIP are
              required from the applicant.
            </p>
            <div className="mt-4">
              <AdminLocalityReview
                applicantId={applicant.id}
                locality={locality}
              />
            </div>
          </Card>
        ) : null}

        {detailSections.includes('vouches') ? (
          <Card className="lg:col-span-2">
            <h2 className="text-display text-lg font-semibold">
              Member vouches
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional community endorsements — includes private notes for
              moderation. Not required for approval.
            </p>
            <div className="mt-4">
              <AdminMemberVouches vouches={memberVouches} />
            </div>
          </Card>
        ) : null}

        {detailSections.includes('billing') ? (
          <Card className="lg:col-span-2">
            <h2 className="text-display text-lg font-semibold">
              Billing & plan status
            </h2>
            <div className="mt-4">
              <AdminBillingStatus applicantId={applicant.id} billing={billing} />
            </div>
          </Card>
        ) : null}

        {detailSections.includes('review_actions') ? (
          <Card className="lg:col-span-2">
            <h2 className="text-display text-lg font-semibold">
              Review actions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Approve to grant verified membership and discovery visibility.
            </p>
            <div className="mt-4">
              <ApplicationReviewActions applicantId={applicant.id} />
            </div>
            {applicant.admin_review_notes ? (
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  Previous notes:{' '}
                </span>
                {applicant.admin_review_notes}
              </p>
            ) : null}
            {applicant.application_submitted_at ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Submitted{' '}
                {new Date(applicant.application_submitted_at).toLocaleString()}
              </p>
            ) : null}
          </Card>
        ) : null}

        {detailSections.includes('remove_member') ? (
          <Card className="lg:col-span-2 border-danger/30">
            <h2 className="text-display text-lg font-semibold text-danger">
              Remove member
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete this account and all related member data.
            </p>
            <div className="mt-4">
              <RemoveMemberButton
                userId={applicant.id}
                memberName={
                  applicant.full_name ?? applicant.email ?? 'Unknown member'
                }
                memberEmail={applicant.email}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </>
  )
}
