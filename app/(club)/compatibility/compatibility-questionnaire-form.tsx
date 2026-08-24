'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveCompatibilityQuestionnaire } from '@/app/(club)/compatibility/actions'
import Card from '@/components/ui/card'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'
import {
  COMPATIBILITY_QUESTIONNAIRE_SECTIONS,
  questionsForSection,
  type CompatibilityQuestionDefinition,
} from '@/lib/compatibility/questionnaire-config'
import type { CompatibilityQuestionnaireAnswers } from '@/lib/compatibility/questionnaire'
import {
  datingAgeFieldErrors,
  hasBlockingDatingAgeFieldErrors,
  parseIntegerAgeInput,
  PREFERRED_MATCH_AGE_RANGE_LAYOUT_CLASS,
  preferredMatchAgeRangeSummary,
} from '@/lib/compatibility/age-preferences'

type CompatibilityQuestionnaireFormProps = {
  initialAnswers: CompatibilityQuestionnaireAnswers
  completed: boolean
}

function isQuestionVisible(
  question: CompatibilityQuestionDefinition,
  answers: CompatibilityQuestionnaireAnswers
): boolean {
  if (!question.visibleWhen) {
    return true
  }

  const currentValue =
    answers[question.visibleWhen.field as keyof CompatibilityQuestionnaireAnswers]
  return currentValue === question.visibleWhen.value
}

export default function CompatibilityQuestionnaireForm({
  initialAnswers,
  completed,
}: CompatibilityQuestionnaireFormProps) {
  const router = useRouter()
  const [answers, setAnswers] =
    useState<CompatibilityQuestionnaireAnswers>(initialAnswers)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setAnswers(initialAnswers)
  }, [initialAnswers])

  const ageFieldErrors = datingAgeFieldErrors(answers)
  const hasBlockingAgeErrors = hasBlockingDatingAgeFieldErrors(answers)

  const visibleQuestions = useMemo(
    () =>
      COMPATIBILITY_QUESTIONNAIRE_SECTIONS.flatMap((section) =>
        questionsForSection(section.id).filter((question) =>
          isQuestionVisible(question, answers)
        )
      ),
    [answers]
  )

  const setSingleValue = (questionId: string, value: string | number) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: value,
      ...(questionId === 'gender' && value !== 'self_describe'
        ? { genderSelfDescribe: '' }
        : {}),
    }))
  }

  const toggleMultiValue = (
    question: CompatibilityQuestionDefinition,
    value: string
  ) => {
    setAnswers((current) => {
      const field =
        question.id === 'matchInterests' ? 'matchInterests' : 'familySituation'
      const currentValues = current[field]

      if (question.exclusiveOption && value === question.exclusiveOption) {
        return { ...current, [field]: [value] }
      }

      const withoutExclusive = currentValues.filter(
        (item) => item !== question.exclusiveOption
      )
      const nextValues = withoutExclusive.includes(value)
        ? withoutExclusive.filter((item) => item !== value)
        : [...withoutExclusive, value]

      return { ...current, [field]: nextValues }
    })
  }

  const save = (complete: boolean) => {
    setSuccessMessage('')
    setErrorMessage('')
    startTransition(async () => {
      const result = await saveCompatibilityQuestionnaire({
        answers,
        complete,
      })

      if ('error' in result && result.error) {
        setErrorMessage(result.error)
        return
      }

      setSuccessMessage(
        complete
          ? 'Questionnaire complete. You are eligible for curated match recommendations.'
          : 'Progress saved.'
      )
      router.refresh()
    })
  }

  const optionCardClassName =
    'flex items-start gap-2 rounded-lg border border-border px-3 py-2 transition hover:bg-surface-elevated has-[:focus-visible]:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/30'

  const renderQuestion = (question: CompatibilityQuestionDefinition) => {
    if (question.type === 'text') {
      return (
        <label key={question.id} className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">{question.prompt}</span>
          {question.helperText ? (
            <span className="text-muted-foreground">{question.helperText}</span>
          ) : null}
          <input
            type="text"
            value={answers.genderSelfDescribe}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                genderSelfDescribe: event.target.value,
              }))
            }
            className={inputClassName}
            disabled={isPending}
          />
        </label>
      )
    }

    if (question.type === 'multi') {
      const values =
        question.id === 'matchInterests'
          ? answers.matchInterests
          : answers.familySituation

      return (
        <fieldset key={question.id} className="grid gap-2 text-sm">
          <legend className="font-medium text-foreground">{question.prompt}</legend>
          {question.helperText ? (
            <p className="text-muted-foreground">{question.helperText}</p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-1">
            {question.options?.map((option) => {
              const optionValue = String(option.value)
              const checked = values.includes(optionValue)
              return (
                <label key={optionValue} className={optionCardClassName}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMultiValue(question, optionValue)}
                    disabled={isPending}
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

    if (question.type === 'number') {
      const ageError = ageFieldErrors.age
      const helpId = 'compatibility-age-help'
      const errorId = 'compatibility-age-error'
      return (
        <div key={question.id} className="grid min-w-0 gap-1.5 text-sm">
          <label htmlFor="compatibility-age" className="font-medium text-foreground">
            {question.prompt}
          </label>
          {question.helperText ? (
            <p id={helpId} className="text-muted-foreground">
              {question.helperText}
            </p>
          ) : null}
          <input
            id="compatibility-age"
            name="age"
            type="number"
            inputMode="numeric"
            min={question.min ?? 18}
            max={question.max ?? 99}
            step={1}
            value={answers.age ?? ''}
            aria-invalid={ageError ? true : undefined}
            aria-describedby={[question.helperText ? helpId : null, ageError ? errorId : null]
              .filter(Boolean)
              .join(' ') || undefined}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                age: parseIntegerAgeInput(event.target.value),
              }))
            }
            className={`${inputClassName} max-w-full`}
            disabled={isPending}
          />
          {ageError ? (
            <p id={errorId} role="alert" className="text-danger">
              {ageError}
            </p>
          ) : null}
        </div>
      )
    }

    if (question.type === 'age_range') {
      const minError = ageFieldErrors.preferredMatchAgeMin
      const maxError = ageFieldErrors.preferredMatchAgeMax
      const rangeError = ageFieldErrors.preferredMatchAgeRange
      const helpId = 'compatibility-preferred-match-age-help'
      const minErrorId = 'compatibility-preferred-match-age-min-error'
      const maxErrorId = 'compatibility-preferred-match-age-max-error'
      const rangeErrorId = 'compatibility-preferred-match-age-range-error'
      const summary = preferredMatchAgeRangeSummary(
        answers.preferredMatchAgeMin,
        answers.preferredMatchAgeMax
      )
      return (
        <fieldset key={question.id} className="grid min-w-0 gap-2 text-sm">
          <legend className="font-medium text-foreground">{question.prompt}</legend>
          {question.helperText ? (
            <p id={helpId} className="text-muted-foreground">
              {question.helperText}
            </p>
          ) : null}
          <div className={PREFERRED_MATCH_AGE_RANGE_LAYOUT_CLASS}>
            <div className="grid min-w-0 gap-1.5">
              <label
                htmlFor="compatibility-preferred-match-age-min"
                className="text-foreground"
              >
                Minimum age
              </label>
              <input
                id="compatibility-preferred-match-age-min"
                name="preferredMatchAgeMin"
                type="number"
                inputMode="numeric"
                min={question.min ?? 18}
                max={question.max ?? 99}
                step={1}
                value={answers.preferredMatchAgeMin ?? ''}
                aria-invalid={minError || rangeError ? true : undefined}
                aria-describedby={[
                  helpId,
                  minError ? minErrorId : null,
                  rangeError ? rangeErrorId : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    preferredMatchAgeMin: parseIntegerAgeInput(event.target.value),
                  }))
                }
                className={`${inputClassName} w-full min-w-0`}
                disabled={isPending}
              />
              {minError ? (
                <p id={minErrorId} role="alert" className="text-danger">
                  {minError}
                </p>
              ) : null}
            </div>
            <div className="grid min-w-0 gap-1.5">
              <label
                htmlFor="compatibility-preferred-match-age-max"
                className="text-foreground"
              >
                Maximum age
              </label>
              <input
                id="compatibility-preferred-match-age-max"
                name="preferredMatchAgeMax"
                type="number"
                inputMode="numeric"
                min={question.min ?? 18}
                max={question.max ?? 99}
                step={1}
                value={answers.preferredMatchAgeMax ?? ''}
                aria-invalid={maxError || rangeError ? true : undefined}
                aria-describedby={[
                  helpId,
                  maxError ? maxErrorId : null,
                  rangeError ? rangeErrorId : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    preferredMatchAgeMax: parseIntegerAgeInput(event.target.value),
                  }))
                }
                className={`${inputClassName} w-full min-w-0`}
                disabled={isPending}
              />
              {maxError ? (
                <p id={maxErrorId} role="alert" className="text-danger">
                  {maxError}
                </p>
              ) : null}
            </div>
          </div>
          {rangeError ? (
            <p id={rangeErrorId} role="alert" className="text-danger">
              {rangeError}
            </p>
          ) : null}
          {summary ? (
            <p className="text-muted-foreground" aria-live="polite">
              {summary}
            </p>
          ) : null}
        </fieldset>
      )
    }

    if (question.type === 'scale' || question.type === 'single') {
      const value = answers[question.id as keyof CompatibilityQuestionnaireAnswers]

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
        curated recommendations find strong fits.
      </p>

      {completed ? (
        <p className="mt-3 rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-sm text-success">
          Your questionnaire is complete. You can update answers anytime — changes
          may affect future match batches.
        </p>
      ) : null}

      <div className="mt-6 grid gap-10">
        {COMPATIBILITY_QUESTIONNAIRE_SECTIONS.map((section, sectionIndex) => {
          const sectionQuestions = questionsForSection(section.id).filter(
            (question) => isQuestionVisible(question, answers)
          )

          return (
            <section key={section.id} className="grid gap-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Section {sectionIndex + 1} of{' '}
                  {COMPATIBILITY_QUESTIONNAIRE_SECTIONS.length}
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
          disabled={isPending || hasBlockingAgeErrors}
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
            disabled={isPending || hasBlockingAgeErrors}
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
          {visibleQuestions.length} questions · All required before completion
        </p>
      ) : null}
    </Card>
  )
}
