import { APPLICATION_FORM_STEPS } from '@/lib/application-form-content'
import {
  APPLICATION_STEP_BUTTON_CLASS,
  APPLICATION_STEP_CURRENT_LABEL_CLASS,
  APPLICATION_STEP_LIST_CLASS,
  applicationStepStatusLabel,
} from '@/lib/application-mobile-ui'

export default function ApplicationStepProgress({
  currentStep,
  onStepSelect,
}: {
  currentStep: number
  onStepSelect?: (step: number) => void
}) {
  const currentTitle =
    APPLICATION_FORM_STEPS.find((step) => step.id === currentStep)?.title ?? ''

  return (
    <div className="mb-6 min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Step {currentStep} of {APPLICATION_FORM_STEPS.length}
        </span>
        <span>
          {Math.round((currentStep / APPLICATION_FORM_STEPS.length) * 100)}%
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-accent-soft"
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={APPLICATION_FORM_STEPS.length}
        aria-label={applicationStepStatusLabel(
          currentStep,
          APPLICATION_FORM_STEPS.length,
          currentTitle
        )}
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{
            width: `${(currentStep / APPLICATION_FORM_STEPS.length) * 100}%`,
          }}
        />
      </div>
      <p className={APPLICATION_STEP_CURRENT_LABEL_CLASS}>{currentTitle}</p>
      <ol className={APPLICATION_STEP_LIST_CLASS}>
        {APPLICATION_FORM_STEPS.map((step) => {
          const done = step.id < currentStep
          const active = step.id === currentStep
          const className = `${APPLICATION_STEP_BUTTON_CLASS} ${
            active
              ? 'border-accent/35 bg-accent-soft font-brand text-foreground'
              : done
                ? 'border-border bg-surface text-muted-foreground hover:border-accent/30 hover:text-foreground'
                : 'border-border/80 text-muted-foreground hover:border-accent/30 hover:text-foreground'
          }`

          return (
            <li key={step.id} className="min-w-0">
              {onStepSelect ? (
                <button
                  type="button"
                  className={className}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => onStepSelect(step.id)}
                >
                  <span className="font-medium">{step.id}.</span> {step.title}
                </button>
              ) : (
                <div className={className}>
                  <span className="font-medium">{step.id}.</span> {step.title}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
