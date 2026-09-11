'use client'

import {
  RSVP_QUESTION_FIELD_LABEL,
  RSVP_QUESTION_HOST_GUIDANCE,
  RSVP_QUESTION_MAX_CHARS,
  RSVP_QUESTION_REQUIRED_LABEL,
  RSVP_QUESTION_SECTION_HEADING,
  RSVP_QUESTION_SECTION_HELPER,
} from '@/lib/event-rsvp-question'
import { textareaClassName } from '@/lib/event-labels'

type EventRsvpQuestionFieldsProps = {
  question: string
  required: boolean
  disabled?: boolean
  onQuestionChange: (value: string) => void
  onRequiredChange: (value: boolean) => void
}

export default function EventRsvpQuestionFields({
  question,
  required,
  disabled = false,
  onQuestionChange,
  onRequiredChange,
}: EventRsvpQuestionFieldsProps) {
  const hasQuestion = question.trim().length > 0

  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium text-foreground">
          {RSVP_QUESTION_SECTION_HEADING}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {RSVP_QUESTION_SECTION_HELPER}
        </p>
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {RSVP_QUESTION_FIELD_LABEL}
        </span>
        <textarea
          value={question}
          onChange={(event) => {
            const next = event.target.value
            onQuestionChange(next)
            if (!next.trim()) {
              onRequiredChange(false)
            }
          }}
          maxLength={RSVP_QUESTION_MAX_CHARS}
          disabled={disabled}
          className={`${textareaClassName} min-h-[6rem]`}
          aria-describedby="event-rsvp-question-guidance"
        />
        <span className="text-xs text-muted-foreground">
          {question.trim().length}/{RSVP_QUESTION_MAX_CHARS}
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={hasQuestion && required}
          disabled={disabled || !hasQuestion}
          onChange={(event) => onRequiredChange(event.target.checked)}
        />
        <span className="min-w-0 leading-relaxed text-foreground">
          {RSVP_QUESTION_REQUIRED_LABEL}
        </span>
      </label>

      <p
        id="event-rsvp-question-guidance"
        className="text-xs leading-relaxed text-muted-foreground"
      >
        {RSVP_QUESTION_HOST_GUIDANCE}
      </p>
    </div>
  )
}
