'use server'

import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { compatibilityEntitlementInputFromViewer } from '@/lib/compatibility/viewer-context'
import { includesFriendsIntent } from '@/lib/member-public-intent'
import { queueFriendshipRecommendationRefresh } from '@/lib/friendship/auto-generate'
import { revalidateFriendshipRoutes } from '@/lib/friendship/revalidate-routes'
import {
  friendshipAnswersJson,
  loadOwnFriendshipQuestionnaire,
} from '@/lib/friendship/candidate-pool'
import { assertCanMutateFriendshipQuestionnaire } from '@/lib/friendship/eligibility'
import {
  isFriendshipQuestionnaireComplete,
  validateFriendshipAnswersForSave,
  type FriendshipQuestionnaireAnswers,
} from '@/lib/friendship/questionnaire'
import { FRIENDSHIP_QUESTIONNAIRE_VERSION } from '@/lib/friendship/questionnaire-config'

export async function saveFriendshipQuestionnaire(input: {
  answers: FriendshipQuestionnaireAnswers
  complete: boolean
}) {
  const viewer = await getViewer()
  if (!viewer) {
    return { error: 'You must be signed in.' }
  }

  const { entitlements } = await loadMemberEntitlementsForViewer()
  const supabase = await createClient()
  const existing = await loadOwnFriendshipQuestionnaire(supabase, viewer.userId)
  const access = assertCanMutateFriendshipQuestionnaire({
    signedIn: true,
    approved: viewer.canAccessApp,
    friendsIntent: includesFriendsIntent(viewer.profile?.connection_intents),
    entitlementInput: compatibilityEntitlementInputFromViewer(viewer, entitlements),
    questionnaire: existing,
  })

  if (!access.ok) {
    return { error: access.error }
  }

  const validation = validateFriendshipAnswersForSave(input.answers, input.complete)
  if ('error' in validation) {
    return { error: validation.error }
  }

  const questionnaire = validation.questionnaire
  const now = new Date().toISOString()
  const questionnaireComplete = isFriendshipQuestionnaireComplete(questionnaire)
  const shouldMarkComplete = input.complete && questionnaireComplete
  const wasSubmitted = existing?.status === 'submitted' && existing.completed_at != null

  let status: 'draft' | 'submitted' = 'draft'
  let completedAt: string | null = null
  if (shouldMarkComplete) {
    status = 'submitted'
    completedAt = existing?.completed_at ?? now
  } else if (questionnaireComplete && wasSubmitted) {
    status = 'submitted'
    completedAt = existing?.completed_at ?? now
  }

  const { error } = await supabase.from('friendship_questionnaires').upsert(
    {
      user_id: viewer.userId,
      version: FRIENDSHIP_QUESTIONNAIRE_VERSION,
      answers: friendshipAnswersJson(questionnaire),
      status,
      completed_at: completedAt,
      updated_at: now,
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    return { error: error.message }
  }

  if (shouldMarkComplete) {
    queueFriendshipRecommendationRefresh(viewer.userId)
  }

  revalidateFriendshipRoutes()

  return { success: true as const }
}
