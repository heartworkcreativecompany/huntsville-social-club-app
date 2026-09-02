import Link from 'next/link'
import { redirect } from 'next/navigation'
import FriendshipQuestionnaireForm from '@/app/(club)/friendship/friendship-questionnaire-form'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { loadOwnFriendshipQuestionnaire } from '@/lib/friendship/candidate-pool'
import { friendshipContextForViewer } from '@/lib/friendship/viewer-context'
import {
  friendshipAnswersFromStored,
  isFriendshipQuestionnaireSubmitted,
} from '@/lib/friendship/questionnaire'

export default async function FriendshipQuestionnairePage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  const { entitlements } = await loadMemberEntitlementsForViewer()
  const supabase = await createClient()
  const questionnaire = await loadOwnFriendshipQuestionnaire(supabase, viewer.userId)
  const { access } = friendshipContextForViewer(viewer, entitlements, questionnaire)

  if (!access.canViewSection && access.status === 'no_friends') {
    redirect('/profile')
  }

  const answers = friendshipAnswersFromStored(questionnaire?.answers)
  const completed = isFriendshipQuestionnaireSubmitted({
    answers: questionnaire?.answers,
    status: questionnaire?.status,
    completed_at: questionnaire?.completed_at,
  })

  return (
    <>
      <PageHeader
        eyebrow="Private"
        title="Friendship compatibility questionnaire"
        description="Private answers for friend recommendations. Never shown on your public profile."
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
        <h2 className="text-display text-lg font-semibold">{access.headline}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{access.detail}</p>
        {access.ctaHref && access.ctaLabel && !access.canViewForm ? (
          <Link
            href={access.ctaHref}
            className="mt-4 inline-flex text-sm font-medium text-accent underline"
          >
            {access.ctaLabel}
          </Link>
        ) : null}
        {access.canViewMatches ? (
          <Link
            href="/matches/friends"
            className="mt-4 inline-flex text-sm font-medium text-accent underline"
          >
            {access.ctaLabel ?? 'See status'}
          </Link>
        ) : null}
      </Card>

      {access.canViewForm ? (
        <FriendshipQuestionnaireForm
          key={`${questionnaire?.updated_at ?? 'new'}:${completed ? 'complete' : 'draft'}`}
          initialAnswers={answers}
          completed={completed}
        />
      ) : null}
    </>
  )
}
