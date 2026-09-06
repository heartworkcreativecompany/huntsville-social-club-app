import Link from 'next/link'
import { redirect } from 'next/navigation'
import CompatibilityQuestionnaireForm from '@/app/(club)/compatibility/compatibility-questionnaire-form'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { compatibilityContextForViewer } from '@/lib/compatibility/viewer-context'
import {
  isCompatibilityQuestionnaireEffectivelyComplete,
  questionnaireAnswersFromStored,
} from '@/lib/compatibility/questionnaire'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { shouldHideCuratedMatchingSurfaces } from '@/lib/membership-entitlements'
import { getViewer } from '@/lib/viewer'

export default async function CompatibilityPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const profile = viewer.profile
  const { entitlements } = await loadMemberEntitlementsForViewer()
  if (shouldHideCuratedMatchingSurfaces(entitlements)) {
    redirect('/dashboard')
  }
  const { summary } = compatibilityContextForViewer(viewer, entitlements)

  const answers = questionnaireAnswersFromStored(
    profile?.compatibility_questionnaire
  )
  const completed = isCompatibilityQuestionnaireEffectivelyComplete({
    compatibility_questionnaire: profile?.compatibility_questionnaire,
    compatibility_completed_at: profile?.compatibility_completed_at ?? null,
  })
  const canUseQuestionnaire =
    summary.status === 'questionnaire_needed' ||
    summary.status === 'questionnaire_in_progress' ||
    summary.status === 'active'

  return (
    <>
      <PageHeader
        eyebrow="Private"
        title="Compatibility questionnaire"
        description="Private answers for curated match recommendations. Never shown on your public profile."
        actions={
          <Link
            href="/compatibility/how-it-works"
            className="text-sm font-medium text-accent underline"
          >
            How it works
          </Link>
        }
      />

      <div className="mb-6">
        <Link
          href="/profile"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to profile
        </Link>
      </div>

      <Card className="mb-6">
        <h2 className="text-display text-lg font-semibold">{summary.headline}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{summary.detail}</p>
        {summary.ctaHref && summary.ctaLabel ? (
          <Link
            href={summary.ctaHref}
            className="mt-4 inline-flex text-sm font-medium text-accent underline"
          >
            {summary.ctaLabel}
          </Link>
        ) : null}
      </Card>

      {canUseQuestionnaire ? (
        <CompatibilityQuestionnaireForm
          initialAnswers={answers}
          completed={completed}
        />
      ) : null}
    </>
  )
}
