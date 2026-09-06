'use server'

import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/viewer'
import { loadMemberEntitlementsForViewer } from '@/lib/load-member-entitlements'
import { canUseCuratedMatching } from '@/lib/membership-entitlements'
import { queueAutoGenerateCuratedMatches } from '@/lib/compatibility/auto-generate-matches'
import { revalidateCuratedMatchMemberRoutes } from '@/lib/compatibility/revalidate-curated-match-routes'
import {
  isQuestionnaireComplete,
  parseCompatibilityQuestionnaire,
  validateQuestionnaireAnswersForSave,
  type CompatibilityQuestionnaireAnswers,
} from '@/lib/compatibility/questionnaire'
import type { Json } from '@/lib/database.types'
import {
  datingAgePreferenceColumnPatch,
  ownProfileCompatibilityWriteFilter,
} from '@/lib/compatibility/age-preferences'

export async function saveCompatibilityQuestionnaire(input: {
  answers: CompatibilityQuestionnaireAnswers
  complete: boolean
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const viewer = await getViewer()
  if (!viewer?.canAccessApp) {
    return { error: 'Membership approval is required.' }
  }
  const { entitlements } = await loadMemberEntitlementsForViewer()
  if (!entitlements || !canUseCuratedMatching(entitlements)) {
    return {
      error:
        'Inner Circle or Elite Circle membership is required to save the Dating Compatibility Questionnaire.',
    }
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('compatibility_completed_at, compatibility_questionnaire')
    .eq('id', user.id)
    .maybeSingle()

  const existingQuestionnaire = parseCompatibilityQuestionnaire(
    existing?.compatibility_questionnaire
  )

  const validation = validateQuestionnaireAnswersForSave(
    input.answers,
    input.complete,
    existingQuestionnaire
  )

  if ('error' in validation) {
    return { error: validation.error }
  }

  const questionnaire = validation.questionnaire

  const now = new Date().toISOString()
  const questionnaireComplete = isQuestionnaireComplete(questionnaire)
  const shouldMarkComplete = input.complete && questionnaireComplete
  const isFirstCompletion =
    shouldMarkComplete && existing?.compatibility_completed_at == null

  let compatibilityCompletedAt: string | null = null
  if (shouldMarkComplete) {
    compatibilityCompletedAt = existing?.compatibility_completed_at ?? now
  } else if (
    questionnaireComplete &&
    existing?.compatibility_completed_at != null
  ) {
    compatibilityCompletedAt = existing.compatibility_completed_at
  }

  const ageColumns = datingAgePreferenceColumnPatch(questionnaire)
  const writeFilter = ownProfileCompatibilityWriteFilter(user.id)

  const { error } = await supabase
    .from('profiles')
    .update({
      compatibility_questionnaire: questionnaire as unknown as Json,
      compatibility_updated_at: now,
      updated_at: now,
      compatibility_completed_at: compatibilityCompletedAt,
      age: ageColumns.age,
      preferred_match_age_min: ageColumns.preferred_match_age_min,
      preferred_match_age_max: ageColumns.preferred_match_age_max,
    })
    .eq(writeFilter.column, writeFilter.value)

  if (error) {
    return { error: error.message }
  }

  if (isFirstCompletion) {
    queueAutoGenerateCuratedMatches(user.id, 'questionnaire_completed')
  }

  revalidateCuratedMatchMemberRoutes()

  return { success: true as const }
}
