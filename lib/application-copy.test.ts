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
import { profileColumnsFromDraft, mergeProfileIntoDraft } from '@/lib/application-draft-sync'
import {
  APPLICATION_FORM_INTRO,
  APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE,
  APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE_ID,
  APPLICATION_PAGE_INTRO,
  APPLICATION_PROMPTS,
  GENDER_OPTIONS,
  REQUIRED_PROMPT_KEYS,
} from '@/lib/application-form-content'
import { CONNECTION_LOOKING_FOR_FIELD } from '@/lib/member-public-intent'
import { requiredPromptsComplete } from '@/lib/application-validation'
import { publicProfileDetailsFromDraft } from '@/lib/profile-public-display'
import { APPLICATION_HELPER_TEXT_CLASS } from '@/lib/application-mobile-ui'
import { adminApplicationAboutRows } from '@/lib/admin-application-review'
import { directoryMemberFromApplicationDraft } from '@/lib/application-profile-preview'
import { enrichProfileFromDraft } from '@/lib/enrich-profile-discovery'
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
    expect(aboutYou?.profileVisible).toBe(false)
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

describe('About you internal-review prompts', () => {
  const internalPrompts = APPLICATION_PROMPTS.filter(
    (prompt) =>
      prompt.key === 'bringsYouHere' || prompt.key === 'hopingToMeet'
  )

  it('marks both required internal-review questions as (required) private', () => {
    const form = applicationFormSource()
    const fieldLabel = form.slice(
      form.indexOf('function FieldLabel'),
      form.indexOf('export default function ApplicationForm')
    )
    expect(fieldLabel).toContain('(required)')
    expect(fieldLabel).toContain('private')
    expect(fieldLabel).not.toContain('(private)')
    expect(form).toContain('privateField={isInternalReview}')

    expect(internalPrompts).toHaveLength(2)
    expect(internalPrompts.map((prompt) => prompt.label)).toEqual([
      'What brings you to the club most right now?',
      'What kind of connections are you open to?',
    ])
    for (const prompt of internalPrompts) {
      expect(prompt.required).toBe(true)
      expect(prompt.profileVisible).toBe(false)
      expect(REQUIRED_PROMPT_KEYS).toContain(prompt.key)
    }
  })

  it('uses shared internal-review helper copy and removes public-visibility wording for those questions', () => {
    expect(APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE).toBe(
      'These answers are for internal review only and are not shown on your public profile.'
    )
    const form = applicationFormSource()
    expect(form).toContain('APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE')
    expect(form).toContain('APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE_ID')
    expect(APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE_ID).toBe(
      'application-internal-review-prompts-notice'
    )
    expect(form).toContain('aria-describedby')
    expect(form).toContain('APPLICATION_HELPER_TEXT_CLASS')
    expect(APPLICATION_HELPER_TEXT_CLASS).toContain('break-words')
    expect(APPLICATION_HELPER_TEXT_CLASS).toContain('min-w-0')
    expect(APPLICATION_HELPER_TEXT_CLASS).toContain('leading-relaxed')
    expect(
      form.indexOf('APPLICATION_INTERNAL_REVIEW_PROMPTS_NOTICE')
    ).toBeLessThan(form.indexOf('!prompt.profileVisible'))
    expect(form).toContain('privateField={isInternalReview}')
    expect(form).toContain("'Visible to other members after approval.'")
    expect(form).toContain('prompt.profileVisible')
  })

  it('keeps both questions required for submit without changing draft save or load', () => {
    const incomplete = emptyDraft()
    expect(requiredPromptsComplete(incomplete)).toBe(false)
    incomplete.prompts.bringsYouHere = 'Looking for a local social circle.'
    incomplete.prompts.hopingToMeet = 'Friends who actually show up.'
    expect(requiredPromptsComplete(incomplete)).toBe(true)

    const loaded = parseApplicationDraft({
      version: 2,
      step: 4,
      prompts: {
        bringsYouHere: 'Looking for a local social circle.',
        hopingToMeet: 'Friends who actually show up.',
      },
    })
    expect(loaded.prompts.bringsYouHere).toBe(
      'Looking for a local social circle.'
    )
    expect(loaded.prompts.hopingToMeet).toBe('Friends who actually show up.')
    expect(loaded.profile.aboutMe).toBe('')

    const form = applicationFormSource()
    expect(form).toContain('saveApplicationDraft')
    expect(form).toContain('submitApplication')
  })

  it('keeps the two answers off public profile and directory presentation paths', () => {
    const draft = parseApplicationDraft({
      version: 2,
      step: 4,
      profile: { aboutMe: 'Public bio for the directory.' },
      prompts: {
        bringsYouHere: 'SECRET_BRINGS_YOU_HERE',
        hopingToMeet: 'SECRET_HOPING_TO_MEET',
        perfectWeekend: 'Farmers market Saturday.',
      },
    })
    const details = publicProfileDetailsFromDraft(draft)
    expect(details.about).toBe('Public bio for the directory.')
    expect(details.prompts.map((prompt) => prompt.label)).not.toContain(
      'What brings you to the club most right now?'
    )
    expect(details.prompts.map((prompt) => prompt.label)).not.toContain(
      'What kind of connections are you open to?'
    )
    expect(JSON.stringify(details)).not.toContain('SECRET_BRINGS_YOU_HERE')
    expect(JSON.stringify(details)).not.toContain('SECRET_HOPING_TO_MEET')
    expect(
      APPLICATION_PROMPTS.filter((prompt) => !prompt.profileVisible).map(
        (prompt) => prompt.key
      )
    ).toEqual(['bringsYouHere', 'hopingToMeet'])
    expect(
      details.prompts.some(
        (prompt) => prompt.value === 'Farmers market Saturday.'
      )
    ).toBe(true)

    const directory = readFileSync(
      join(repoRoot, 'lib/members-discovery.ts'),
      'utf8'
    )
    const queryFields = readFileSync(
      join(repoRoot, 'lib/profile-query-fields.ts'),
      'utf8'
    )
    const card = readFileSync(
      join(repoRoot, 'components/members/member-discovery-card.tsx'),
      'utf8'
    )
    expect(directory).not.toContain('bringsYouHere')
    expect(directory).not.toContain('hopingToMeet')
    expect(queryFields).not.toContain('bringsYouHere')
    expect(queryFields).not.toContain('hopingToMeet')
    expect(card).not.toContain('bringsYouHere')
    expect(card).not.toContain('hopingToMeet')
  })

  it('does not use hopingToMeet as a public bio when aboutMe is missing', () => {
    const draft = parseApplicationDraft({
      version: 2,
      step: 4,
      prompts: {
        bringsYouHere: 'SECRET_BRINGS_YOU_HERE',
        hopingToMeet: 'SECRET_HOPING_TO_MEET',
      },
    })
    expect(draft.profile.aboutMe).toBe('')
    expect(draft.prompts.hopingToMeet).toBe('SECRET_HOPING_TO_MEET')
    expect(draft.prompts.bringsYouHere).toBe('SECRET_BRINGS_YOU_HERE')

    const details = publicProfileDetailsFromDraft(draft)
    expect(details.about).toBeNull()
    expect(JSON.stringify(details)).not.toContain('SECRET_HOPING_TO_MEET')
    expect(JSON.stringify(details)).not.toContain('SECRET_BRINGS_YOU_HERE')

    const previewMember = directoryMemberFromApplicationDraft(draft, {
      userId: 'member_abc',
      applicationStatus: 'approved',
    })
    expect(previewMember.membership_intent).toBeNull()
    expect(JSON.stringify(previewMember)).not.toContain('SECRET_HOPING_TO_MEET')
    expect(JSON.stringify(previewMember)).not.toContain('SECRET_BRINGS_YOU_HERE')

    const adminRows = adminApplicationAboutRows(draft)
    expect(
      adminRows.some(
        (row) =>
          row.key === 'hopingToMeet' && row.value === 'SECRET_HOPING_TO_MEET'
      )
    ).toBe(true)
    expect(
      adminRows.some(
        (row) =>
          row.key === 'bringsYouHere' && row.value === 'SECRET_BRINGS_YOU_HERE'
      )
    ).toBe(true)
    expect(adminRows.find((row) => row.key === 'bio')?.value).toBe('—')

    const merged = mergeProfileIntoDraft({
      full_name: 'Ada',
      membership_intent: 'SECRET_HOPING_TO_MEET',
      location_area: null,
      application_draft: {
        version: 2,
        step: 4,
        prompts: { hopingToMeet: 'SECRET_HOPING_TO_MEET' },
      },
    })
    expect(merged.profile.aboutMe).toBe('')
    expect(merged.prompts.hopingToMeet).toBe('SECRET_HOPING_TO_MEET')

    const genuineBio = mergeProfileIntoDraft({
      full_name: 'Ada',
      membership_intent: 'A real public bio.',
      location_area: null,
      application_draft: {
        version: 2,
        step: 4,
        prompts: { hopingToMeet: 'SECRET_HOPING_TO_MEET' },
      },
    })
    expect(genuineBio.profile.aboutMe).toBe('A real public bio.')
    expect(genuineBio.prompts.hopingToMeet).toBe('SECRET_HOPING_TO_MEET')

    const enriched = enrichProfileFromDraft({
      application_draft: {
        version: 2,
        prompts: { hopingToMeet: 'SECRET_HOPING_TO_MEET' },
      },
      membership_intent: 'SECRET_HOPING_TO_MEET',
    })
    expect(enriched.membership_intent).toBeNull()
  })
})
