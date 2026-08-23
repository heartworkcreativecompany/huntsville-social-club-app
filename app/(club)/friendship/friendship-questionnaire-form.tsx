'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveFriendshipQuestionnaire } from '@/app/(club)/friendship/actions'
import Card from '@/components/ui/card'
import { buttonPrimaryClassName } from '@/lib/event-labels'
import {
  FRIENDSHIP_QUESTIONNAIRE_SECTIONS,
  friendshipQuestionsForSection,
  type FriendshipQuestionDefinition,
} from '@/lib/friendship/questionnaire-config'
import type { FriendshipQuestionnaireAnswers } from '@/lib/friendship/questionnaire'

type FriendshipQuestionnaireFormProps = {
  initialAnswers: FriendshipQuestionnaireAnswers
  completed: boolean
}

export default function FriendshipQuestionnaireForm({
  initialAnswers,
  completed,
}: FriendshipQuestionnaireFormProps) {
  const router = useRouter()
  const [answers, setAnswers] =
    useState<FriendshipQuestionnaireAnswers>(initialAnswers)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const visibleQuestions = useMemo(
    () =>
      FRIENDSHIP_QUESTIONNAIRE_SECTIONS.flatMap((section) =>
        friendshipQuestionsForSection(section.id)
      ),
    []
  )

  const setSingleValue = (questionId: string, value: string | number) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: value,
    }))
  }

  const toggleMultiValue = (
    question: FriendshipQuestionDefinition,
    value: string
  ) => {
    setAnswers((current) => {
      const field = question.id as keyof FriendshipQuestionnaireAnswers
      const currentValues = current[field]
      if (!Array.isArray(currentValues)) {
        return current
      }

      if (question.exclusiveOption && value === question.exclusiveOption) {
        return { ...current, [field]: [value] }
      }

      const withoutExclusive = currentValues.filter(
        (item) => item !== question.exclusiveOption
      )
      if (withoutExclusive.includes(value)) {
        return {
          ...current,
          [field]: withoutExclusive.filter((item) => item !== value),
        }
      }

      if (question.maxSelections && withoutExclusive.length >= question.maxSelections) {
        return current
      }

      return { ...current, [field]: [...withoutExclusive, value] }
    })
  }

  const save = (complete: boolean) => {
    setSuccessMessage('')
    setErrorMessage('')
    startTransition(async () => {
      const result = await saveFriendshipQuestionnaire({
        answers,
        complete,
      })

      if ('error' in result && result.error) {
        setErrorMessage(result.error)
        return
      }

      setSuccessMessage(
        complete
          ? 'Questionnaire complete. You are eligible for friend recommendations.'
          : 'Progress saved.'
      )
      router.refresh()
    })
  }

  const optionCardClassName =
    'flex items-start gap-2 rounded-lg border border-border px-3 py-2 transition hover:bg-surface-elevated has-[:focus-visible]:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/30'

  const renderQuestion = (question: FriendshipQuestionDefinition) => {
    if (question.type === 'multi') {
      const values = answers[question.id as keyof FriendshipQuestionnaireAnswers]
      const selected = Array.isArray(values) ? values : []

      return (
        <fieldset key={question.id} className="grid gap-2 text-sm">
          <legend className="font-medium text-foreground">{question.prompt}</legend>
          {question.helperText ? (
            <p className="text-muted-foreground">{question.helperText}</p>
          ) : null}
          {question.maxSelections ? (
            <p className="text-xs text-muted-foreground">
              Select up to {question.maxSelections}
              {selected.length > 0 ? ` · ${selected.length} selected` : ''}
            </p>
          ) : null}
          <div className="grid gap-2">
            {question.options?.map((option) => {
              const optionValue = String(option.value)
              const checked = selected.includes(optionValue)
              const maxedOut =
                Boolean(question.maxSelections) &&
                !checked &&
                selected.length >= (question.maxSelections ?? 0)
              return (
                <label key={optionValue} className={optionCardClassName}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMultiValue(question, optionValue)}
                    disabled={isPending || maxedOut}
                    className="mt-0.5"
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )
    }

    if (question.type === 'scale' || question.type === 'single') {
      const value = answers[question.id as keyof FriendshipQuestionnaireAnswers]

      return (
        <fieldset key={question.id} className="grid gap-2 text-sm">
          <legend className="font-medium text-foreground">{question.prompt}</legend>
          {question.helperText ? (
            <p className="text-muted-foreground">{question.helperText}</p>
          ) : null}
          <div className="grid gap-2" role="radiogroup" aria-label={question.prompt}>
            {question.options?.map((option) => {
              const optionValue = option.value
              const checked = value === optionValue
              return (
                <label key={String(optionValue)} className={optionCardClassName}>
                  <input
                    type="radio"
                    name={question.id}
                    value={String(optionValue)}
                    checked={checked}
                    onChange={() => setSingleValue(question.id, optionValue)}
                    disabled={isPending}
                    className="mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2"
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )
    }

    return null
  }

  return (
    <Card>
      <p className="text-sm text-muted-foreground">
        These answers are private — never shown on your public profile. They help
        friend recommendations find strong fits. Your selected priorities stay
        private.
      </p>

      {completed ? (
        <p className="mt-3 rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-sm text-success">
          Your Friendship Questionnaire is complete. You can update answers anytime —
          changes refresh future friend recommendations.
        </p>
      ) : null}

      <div className="mt-6 grid gap-10">
        {FRIENDSHIP_QUESTIONNAIRE_SECTIONS.map((section, sectionIndex) => {
          const sectionQuestions = friendshipQuestionsForSection(section.id)

          return (
            <section key={section.id} className="grid gap-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Section {sectionIndex + 1} of{' '}
                  {FRIENDSHIP_QUESTIONNAIRE_SECTIONS.length}
                </p>
                <h2 className="text-display mt-1 text-lg font-semibold text-foreground">
                  {section.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {section.description}
                </p>
              </div>
              <div className="grid max-w-2xl gap-6">
                {sectionQuestions.map((question) => renderQuestion(question))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-8 flex flex-wrap gap-3 border-t border-border pt-6">
        <button
          type="button"
          className={buttonPrimaryClassName}
          disabled={isPending}
          onClick={() => save(true)}
        >
          {isPending
            ? 'Saving…'
            : completed
              ? 'Update answers'
              : 'Complete questionnaire'}
        </button>
        {!completed ? (
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            disabled={isPending}
            onClick={() => save(false)}
          >
            Save progress
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-3 text-sm text-muted-foreground">{successMessage}</p>
      ) : null}

      {!completed ? (
        <p className="mt-2 text-xs text-muted">
          {visibleQuestions.length} prompts · Required before completion
        </p>
      ) : null}
    </Card>
  )
}
