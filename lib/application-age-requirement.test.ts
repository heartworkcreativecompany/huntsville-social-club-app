import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emptyDraft,
  parseApplicationDraft,
  APPLICATION_PRIVATE_FIELD_KEYS,
} from '@/lib/application'
import {
  APPLICATION_AGE_ACK_ERROR,
  APPLICATION_AGE_ACK_HINT,
  APPLICATION_AGE_ACK_LABEL,
  APPLICATION_DOB_HINT,
  APPLICATION_DOB_PRIVACY_NOTICE,
  APPLICATION_DOB_UNDERAGE_ERROR,
} from '@/lib/application-form-content'
import {
  collectApplicationValidationIssues,
  validateApplicationForSubmit,
} from '@/lib/application-validation'
import { publicProfileDetailsFromDraft } from '@/lib/profile-public-display'
import { directoryMemberFromApplicationDraft } from '@/lib/application-profile-preview'
import {
  MIN_DATING_AGE,
  parseAdultAge,
} from '@/lib/compatibility/age-preferences'

const repoRoot = join(__dirname, '..')

function readRepo(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

function formSource() {
  return readRepo('app/(club)/application/application-form.tsx')
}

function actionsSource() {
  return readRepo('app/(club)/application/actions.ts')
}

function isoFromLocalDate(value: Date): string {
  return [
    String(value.getFullYear()),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

function yearsAgoOn(years: number, from: Date): string {
  return isoFromLocalDate(
    new Date(from.getFullYear() - years, from.getMonth(), from.getDate())
  )
}

function draftWithDob(
  dateOfBirth: string,
  ageEligibilityConfirmed = true
) {
  const draft = emptyDraft()
  draft.profile.firstName = 'Ada'
  draft.profile.lastName = 'Lovelace'
  draft.profile.displayName = 'Ada'
  draft.profile.dateOfBirth = dateOfBirth
  draft.agreements.ageEligibilityConfirmed = ageEligibilityConfirmed
  return draft
}

describe('application 18+ eligibility copy', () => {
  it('uses the approved Date of birth helper, underage error, and acknowledgement copy', () => {
    const form = formSource()
    expect(APPLICATION_DOB_HINT).toBe(
      'You must be at least 18 years old to apply for membership.'
    )
    expect(APPLICATION_DOB_UNDERAGE_ERROR).toBe(
      'You must be at least 18 years old to apply for Huntsville Social Club membership.'
    )
    expect(APPLICATION_AGE_ACK_LABEL).toBe(
      'I confirm that I am at least 18 years old.'
    )
    expect(APPLICATION_AGE_ACK_HINT).toBe(
      'Huntsville Social Club is for adults age 18 and older.'
    )
    expect(form).toContain('APPLICATION_DOB_HINT')
    expect(form).toContain('APPLICATION_AGE_ACK_LABEL')
    expect(form).toContain('APPLICATION_AGE_ACK_HINT')
    expect(form).toContain('inlineMessage')
    expect(form).toMatch(/FieldLabel required privateField>\s*Date of birth/)
    expect(form).toContain('APPLICATION_FIELD_IDS.ageAcknowledgement')
    expect(form).toContain('ageEligibilityConfirmed')
    expect(readRepo('lib/application-validation.ts')).toContain(
      'APPLICATION_DOB_UNDERAGE_ERROR'
    )
    expect(readRepo('lib/application-validation.ts')).toContain(
      'APPLICATION_AGE_ACK_ERROR'
    )
  })

  it('places the DOB privacy sentence with the existing review agreements', () => {
    expect(APPLICATION_DOB_PRIVACY_NOTICE).toBe(
      'We collect your date of birth to confirm that you meet the Club’s minimum age requirement and for membership administration. Your full date of birth is not displayed publicly.'
    )
    const form = formSource()
    expect(form).toContain('APPLICATION_DOB_PRIVACY_NOTICE')
    const agreementsMarkup = form.indexOf(
      'id={APPLICATION_FIELD_IDS.agreements}'
    )
    const privacyMarkup = form.indexOf('{APPLICATION_DOB_PRIVACY_NOTICE}')
    const itemsMarkup = form.indexOf('AGREEMENT_ITEMS.map')
    expect(privacyMarkup).toBeGreaterThan(agreementsMarkup)
    expect(itemsMarkup).toBeGreaterThan(privacyMarkup)
  })
})

describe('application 18+ submit validation', () => {
  it('accepts a person who turns 18 today', () => {
    const today = new Date()
    const draft = draftWithDob(yearsAgoOn(18, today))
    expect(
      collectApplicationValidationIssues(draft).some((item) =>
        item.code.startsWith('date_of_birth')
      )
    ).toBe(false)
  })

  it('rejects a person who turns 18 tomorrow', () => {
    const now = new Date()
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    )
    const draft = draftWithDob(yearsAgoOn(18, tomorrow))
    const issue = collectApplicationValidationIssues(draft).find(
      (item) => item.code === 'date_of_birth_underage'
    )
    expect(issue?.inlineMessage).toBe(APPLICATION_DOB_UNDERAGE_ERROR)
  })

  it('rejects a person under 18 in client validation', () => {
    const draft = draftWithDob('2015-04-01')
    const issues = collectApplicationValidationIssues(draft)
    const underage = issues.find(
      (item) => item.code === 'date_of_birth_underage'
    )
    expect(underage).toBeTruthy()
    expect(underage?.inlineMessage).toBe(APPLICATION_DOB_UNDERAGE_ERROR)
    expect(underage?.stepId).toBe(1)
    expect(underage?.focusId).toBe('application-field-dob')
    expect(formSource()).toContain('collectApplicationValidationIssues')
    expect(formSource()).toContain('handleSubmit')
  })

  it('rejects a person under 18 in server-side submission even if the client is bypassed', () => {
    const draft = draftWithDob('2015-04-01')
    const message = validateApplicationForSubmit(draft)
    expect(message).toContain(
      'confirm you are at least 18 years old to apply for Huntsville Social Club membership.'
    )
    expect(message).not.toContain('2015-04-01')

    const submitFn = actionsSource().slice(
      actionsSource().indexOf('export async function submitApplication'),
      actionsSource().indexOf('export async function getApplicationDraftForUser')
    )
    expect(submitFn).toContain('validateApplicationForSubmit(draft)')
    expect(submitFn).not.toContain('dateOfBirth')
  })

  it('rejects invalid and future dates without exposing the DOB', () => {
    const invalid = draftWithDob('2026-02-30')
    const future = draftWithDob('2999-01-01')
    const invalidIssue = collectApplicationValidationIssues(invalid).find(
      (item) => item.code === 'date_of_birth_invalid'
    )
    const futureIssue = collectApplicationValidationIssues(future).find(
      (item) => item.code === 'date_of_birth_invalid'
    )
    expect(invalidIssue?.inlineMessage).toBe('Enter a valid date of birth.')
    expect(futureIssue?.inlineMessage).toBe(
      'Enter a date of birth that is not in the future.'
    )
    expect(invalidIssue?.message).not.toContain('2026-02-30')
    expect(futureIssue?.message).not.toContain('2999-01-01')
    expect(validateApplicationForSubmit(invalid)).not.toContain('2026-02-30')
    expect(validateApplicationForSubmit(future)).not.toContain('2999-01-01')
  })

  it('requires the 18+ acknowledgement on final submit and does not treat it as a DOB substitute', () => {
    const draft = draftWithDob('1990-01-15', false)
    const ack = collectApplicationValidationIssues(draft).find(
      (item) => item.code === 'age_acknowledgement'
    )
    expect(ack?.inlineMessage).toBe(APPLICATION_AGE_ACK_ERROR)
    expect(ack?.focusId).toBe('application-field-age-acknowledgement')
    expect(validateApplicationForSubmit(draft)).toContain(
      'confirm that you are at least 18 years old.'
    )

    const underageWithAck = draftWithDob('2015-04-01', true)
    expect(
      collectApplicationValidationIssues(underageWithAck).some(
        (item) => item.code === 'date_of_birth_underage'
      )
    ).toBe(true)
    expect(
      collectApplicationValidationIssues(underageWithAck).some(
        (item) => item.code === 'age_acknowledgement'
      )
    ).toBe(false)
  })
})

describe('application 18+ draft save and resume', () => {
  it('lets draft saving skip DOB and acknowledgement checks', () => {
    const form = formSource()
    const saveBlock = form.slice(
      form.indexOf('const handleSave'),
      form.indexOf('const handleSubmit')
    )
    expect(saveBlock).toContain('saveApplicationDraft')
    expect(saveBlock).not.toContain('collectApplicationValidationIssues')

    const saveFn = actionsSource().slice(
      actionsSource().indexOf('export async function saveApplicationDraft'),
      actionsSource().indexOf('export async function submitApplication')
    )
    expect(saveFn).not.toContain('validateApplicationForSubmit')
    expect(emptyDraft().profile.dateOfBirth).toBe('')
    expect(emptyDraft().agreements.ageEligibilityConfirmed).toBe(false)
  })

  it('restores DOB and acknowledgement state from a saved draft', () => {
    const restored = parseApplicationDraft({
      version: 2,
      step: 2,
      profile: { dateOfBirth: '1991-07-04' },
      agreements: { ageEligibilityConfirmed: true },
    })
    expect(restored.profile.dateOfBirth).toBe('1991-07-04')
    expect(restored.agreements.ageEligibilityConfirmed).toBe(true)
    expect(restored.step).toBe(2)
  })

  it('keeps existing older applications readable without the acknowledgement key', () => {
    const restored = parseApplicationDraft({
      version: 2,
      step: 6,
      profile: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        displayName: 'Ada',
        dateOfBirth: '1990-12-10',
      },
      agreements: {
        codeOfConduct: true,
        informationAccurate: true,
        approvalRequired: true,
        verificationConsent: true,
      },
    })
    expect(restored.profile.dateOfBirth).toBe('1990-12-10')
    expect(restored.agreements.ageEligibilityConfirmed).toBe(false)
    expect(restored.agreements.codeOfConduct).toBe(true)
    expect(APPLICATION_PRIVATE_FIELD_KEYS).toContain('dateOfBirth')
  })
})

describe('application 18+ privacy and matching isolation', () => {
  it('does not include full date of birth in public profile or discovery output', () => {
    const draft = parseApplicationDraft({
      version: 2,
      profile: {
        displayName: 'Ada',
        dateOfBirth: '1990-12-10',
        aboutMe: 'Loves libraries.',
        connectionIntents: ['friends'],
      },
    })
    const details = publicProfileDetailsFromDraft(draft)
    const serialized = JSON.stringify(details)
    expect(serialized).not.toContain('1990-12-10')
    expect(serialized).not.toContain('dateOfBirth')
    expect(Object.keys(details)).not.toContain('dateOfBirth')

    const member = directoryMemberFromApplicationDraft(draft, {
      userId: 'member_1',
      applicationStatus: 'approved',
    })
    expect(JSON.stringify(member)).not.toContain('1990-12-10')
    expect(member).not.toHaveProperty('dateOfBirth')
    expect(member.birth_year).toBe(1990)

    const loadDirectory = readRepo('lib/load-directory-profiles.ts')
    expect(loadDirectory).toContain('birth_year: null')
    expect(loadDirectory).not.toContain('dateOfBirth')
  })

  it('leaves matching and compatibility age logic unchanged', () => {
    expect(MIN_DATING_AGE).toBe(18)
    expect(parseAdultAge(17)).toBeNull()
    expect(parseAdultAge(18)).toBe(18)
    const scoring = readRepo('lib/compatibility/scoring.ts')
    expect(scoring).toContain('ageProximityPoints(viewer.birth_year, candidate.birth_year)')
    expect(scoring).not.toContain('dateOfBirth')
    const profileForm = readRepo('app/(club)/members/profile-form.tsx')
    expect(profileForm).not.toContain('dateOfBirth')
    const adminReview = readRepo('app/(club)/admin/applications/[id]/page.tsx')
    expect(adminReview).toContain('Date of birth (private)')
    expect(adminReview).toContain('draft.profile.dateOfBirth')
  })
})
