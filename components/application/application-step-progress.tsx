import { APPLICATION_FORM_STEPS } from '@/lib/application-form-content'

export default function ApplicationStepProgress({
  currentStep,
}: {
  currentStep: number
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
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
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{
            width: `${(currentStep / APPLICATION_FORM_STEPS.length) * 100}%`,
          }}
        />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {APPLICATION_FORM_STEPS.map((step) => {
          const done = step.id < currentStep
          const active = step.id === currentStep

          return (
            <li
              key={step.id}
              className={`rounded-full border px-3 py-2 text-xs ${
                active
                  ? 'border-accent/35 bg-accent-soft font-brand text-foreground'
                  : done
                    ? 'border-border bg-surface text-muted-foreground'
                    : 'border-border/80 text-muted-foreground'
              }`}
            >
              <span className="font-medium">{step.id}.</span> {step.title}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
