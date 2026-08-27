/**
 * Mobile-first layout helpers for the membership application journey.
 * Presentation only — does not change step order, validation, or persistence.
 */

export const APPLICATION_STEP_CURRENT_LABEL_CLASS =
  'mt-2 text-sm font-medium text-foreground sm:hidden'

export const APPLICATION_STEP_LIST_CLASS =
  'mt-4 hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3'

export const APPLICATION_STEP_BUTTON_CLASS =
  'min-h-11 w-full rounded-full border px-3 py-2 text-left text-xs transition'

export const APPLICATION_ACTIONS_CLASS =
  'mt-6 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center'

export const MOBILE_FULL_CONTROL_CLASS = 'w-full min-w-0 sm:w-auto'

export const CHOICE_ROW_CLASS =
  'flex min-h-11 min-w-0 items-center gap-3 text-sm'

export const AGREEMENT_ROW_CLASS =
  'flex min-h-11 min-w-0 items-start gap-3 py-1 text-sm'

/** Helper copy under application field labels — wraps on 320px–390px. */
export const APPLICATION_HELPER_TEXT_CLASS =
  'min-w-0 text-xs leading-relaxed break-words text-muted-foreground'

export function applicationStepStatusLabel(
  currentStep: number,
  totalSteps: number,
  stepTitle: string
): string {
  return `Step ${currentStep} of ${totalSteps}: ${stepTitle}`
}
