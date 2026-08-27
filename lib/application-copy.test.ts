import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  emptyDraft,
  parseApplicationDraft,
  showApplicationReviewActionCard,
  showApplicationStatusTracking,
} from '@/lib/application'
import { profileColumnsFromDraft } from '@/lib/application-draft-sync'
import {
  APPLICATION_FORM_INTRO,
  APPLICATION_PAGE_INTRO,
  APPLICATION_PROMPTS,
  GENDER_OPTIONS,
} from '@/lib/application-form-content'
import { CONNECTION_LOOKING_FOR_FIELD } from '@/lib/member-public-intent'
import PageHeader from '@/components/ui/page-header'

const repoRoot = join(__dirname, '..')

function applicationPageSource() {
  return readFileSync(
    join(repoRoot, 'app/(club)/application/page.tsx'),
    'utf8'
  )
}

function applicationFormSource() {
  return readFileSync(
    join(repoRoot, 'app/(club)/application/application-form.tsx'),
    'utf8'
  )
}

describe('application page intro copy', () => {
  it('uses the approved unsubmitted page introduction', () => {
    expect(APPLICATION_PAGE_INTRO).toBe(
      'Tell us about yourself. Be sure to save your answers along the way if you need to come back to finish. Once submitted, we will manually review your answers to confirm you are ready to join the club.'
    )
    expect(APPLICATION_PAGE_INTRO).toContain('save')
    expect(applicationPageSource()).toContain('APPLICATION_PAGE_INTRO')
    expect(applicationPageSource()).toContain('title="Your application"')
  })

  it('uses the approved application-form introduction', () => {
    expect(APPLICATION_FORM_INTRO).toBe(
      'We only accept real people that have been verified by our administrative staff. Provide only accurate information that can be verified or your application will be rejected or returned for changes. Fields marked as required must be complete before submission. Optional fields do not block approval if left empty, but they do help your profile stand out to future connections.'
    )
    expect(applicationFormSource()).toContain('APPLICATION_FORM_INTRO')
    expect(applicationFormSource()).toContain('break-words')
  })
})

describe('unsubmitted vs submitted application chrome', () => {
  it('hides Track status and the Complete your application card for a draft', () => {
    expect(showApplicationStatusTracking('draft')).toBe(false)
    expect(showApplicationReviewActionCard('draft')).toBe(false)

    const page = applicationPageSource()
    expect(page).toContain('showApplicationStatusTracking')
    expect(page).not.toContain('Complete your application')
    expect(page).not.toContain('Continue application')
    expect(page).not.toMatch(/status === 'draft' \|\| status === 'needs_info'/)
  })

  it('keeps status access after submit and during review', () => {
    expect(showApplicationStatusTracking('submitted')).toBe(true)
    expect(showApplicationStatusTracking('in_review')).toBe(true)
    expect(showApplicationStatusTracking('needs_info')).toBe(true)
    expect(showApplicationStatusTracking('rejected')).toBe(true)

    const page = applicationPageSource()
    expect(page).toContain('Track status')
    expect(page).toContain('View status & verification')
    expect(page).toContain('/application/status')
  })

  it('keeps reviewer-requested update cards only for needs_info and rejected', () => {
    expect(showApplicationReviewActionCard('needs_info')).toBe(true)
    expect(showApplicationReviewActionCard('rejected')).toBe(true)
    expect(showApplicationReviewActionCard('submitted')).toBe(false)
    expect(applicationPageSource()).toContain('View full status')
  })
})

describe('application field labels', () => {
  it('renders private as plain text, not (private)', () => {
    const form = applicationFormSource()
    const fieldLabel = form.slice(
      form.indexOf('function FieldLabel'),
      form.indexOf('export default function ApplicationForm')
    )
    expect(fieldLabel).toContain('(required)')
    expect(fieldLabel).toContain('private')
    expect(fieldLabel).not.toContain('(private)')
    expect(form).toContain('<FieldLabel required>First name</FieldLabel>')
    expect(form).toMatch(/FieldLabel required privateField>\s*Last name/)
    expect(form).toMatch(/FieldLabel required privateField>\s*Date of birth/)
  })
})

describe('application gender options', () => {
  it('shows Female and Male while keeping woman/man persisted values', () => {
    expect(GENDER_OPTIONS).toEqual([
      { value: '', label: 'Prefer not to say' },
      { value: 'woman', label: 'Female' },
      { value: 'man', label: 'Male' },
      { value: 'non_binary', label: 'Non-binary' },
      { value: 'other', label: 'Another identity' },
    ])

    const saved = parseApplicationDraft({
      version: 2,
      step: 1,
      profile: { gender: 'woman', connectionsOpenTo: ['Activity partners'] },
    })
    expect(saved.profile.gender).toBe('woman')
  })
})

describe('first-step connection questions', () => {
  it('removes Connection types open to from the first application step', () => {
    const form = applicationFormSource()
    expect(form).not.toContain('CONNECTION_TYPES_OPEN_TO_FIELD')
    expect(form).not.toContain('CONNECTION_OPEN_TO_OPTIONS')
    expect(form).not.toContain('Connection types open to')
    expect(form).not.toContain('Activity partners')
    expect(form).not.toContain('Community collaborators')
    expect(form).not.toContain('Low-key social hangs')
    expect(form).not.toContain('Members-only events')
  })

  it('keeps the required looking-for question and About you prompt', () => {
    const form = applicationFormSource()
    expect(form).toContain('CONNECTION_LOOKING_FOR_FIELD')
    expect(CONNECTION_LOOKING_FOR_FIELD.label).toBe(
      'What kinds of connections are you looking for?'
    )
    expect(form).toContain('min={1}')
    expect(form).toContain('MEMBER_PUBLIC_INTENT_LABELS')

    const aboutYou = APPLICATION_PROMPTS.find((prompt) => prompt.key === 'hopingToMeet')
    expect(aboutYou?.required).toBe(true)
    expect(aboutYou?.label).toBe('What kind of connections are you open to?')
    expect(form).toContain('APPLICATION_PROMPTS')
  })

  it('loads existing drafts that still contain the removed optional field', () => {
    const draft = parseApplicationDraft({
      version: 2,
      step: 1,
      profile: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        displayName: 'Ada',
        gender: 'woman',
        connectionIntents: ['friends'],
        connectionsOpenTo: ['Activity partners', 'Members-only events'],
      },
    })

    expect(draft.profile.connectionsOpenTo).toEqual([
      'Activity partners',
      'Members-only events',
    ])
    expect(draft.profile.connectionIntents).toEqual(['friends'])

    const columns = profileColumnsFromDraft(draft)
    expect(columns.connections_open_to).toEqual([
      'Activity partners',
      'Members-only events',
    ])
    expect(columns.application_draft).toMatchObject({
      profile: {
        connectionsOpenTo: ['Activity partners', 'Members-only events'],
      },
    })
  })

  it('keeps draft save and submit wiring unchanged', () => {
    const form = applicationFormSource()
    expect(form).toContain('saveApplicationDraft')
    expect(form).toContain('submitApplication')
    expect(emptyDraft().profile.connectionsOpenTo).toEqual([])
  })
})

describe('application intro wrapping', () => {
  it('keeps page-header copy wrapping on a narrow column', () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        title: 'Your application',
        description: APPLICATION_PAGE_INTRO,
      })
    )
    expect(html).toContain('break-words')
    expect(html).toContain('min-w-0')
    expect(html).toContain('Your application')
    expect(html).toContain(APPLICATION_PAGE_INTRO)
  })
})
