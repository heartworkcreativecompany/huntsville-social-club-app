import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyDraft, parseApplicationDraft } from '@/lib/application'
import {
  APPLICATION_FORM_STEPS,
  APPLICATION_REVIEW_PREVIEW_NOTICE,
  applicationGoBackToStepPrefix,
  applicationStepTitle,
} from '@/lib/application-form-content'
import {
  collectApplicationValidationIssues,
  validateApplicationForSubmit,
  validateApplicationStep,
} from '@/lib/application-validation'
import { BUSINESS_LISTING_INDUSTRIES } from '@/lib/business-listing-industries'
import { INDUSTRY_OPTIONS, parseIndustryValue } from '@/lib/industries'
import {
  DEFAULT_DISCOVERY_FILTERS,
  filterDirectoryMembers,
  sortDirectoryMembers,
  type DirectoryMember,
} from '@/lib/members-discovery'

const repoRoot = join(__dirname, '..')

function formSource() {
  return readFileSync(
    join(repoRoot, 'app/(club)/application/application-form.tsx'),
    'utf8'
  )
}

function collapsedFormSource() {
  return formSource().replace(/\s+/g, ' ')
}

function previewSource() {
  return readFileSync(
    join(
      repoRoot,
      'components/application/application-profile-preview.tsx'
    ),
    'utf8'
  )
}

function stubMember(
  patch: Partial<DirectoryMember> = {}
): DirectoryMember {
  return {
    id: 'member_abc',
    contactEmail: null,
    full_name: 'Alex Rivera',
    role: 'member',
    created_at: null,
    membership_intent: null,
    verified_at: null,
    membership_status: 'approved',
    photos: [],
    location_area: 'Huntsville',
    discovery_intent: null,
    location_city: null,
    location_zip: null,
    birth_year: null,
    discovery_interests: [],
    discovery_industry: null,
    public_intents: [],
    verification_state: {},
    membership_tier: 'member',
    vendor_reviewed_badge: false,
    ...patch,
  }
}

describe('location step order', () => {
  it('renders the metro Yes/No question above the city/ZIP explanatory copy', () => {
    const source = formSource()
    const heading = source.indexOf('Location')
    const metro = source.indexOf('Do you live in the Huntsville metro area?')
    const copy = source.indexOf(
      'City and ZIP help us confirm local membership'
    )
    const city = source.indexOf('<FieldLabel privateField>City</FieldLabel>')
    expect(heading).toBeGreaterThan(-1)
    expect(metro).toBeGreaterThan(heading)
    expect(copy).toBeGreaterThan(metro)
    expect(city).toBeGreaterThan(copy)
  })

  it('keeps the metro field required with unchanged persisted values', () => {
    const draft = emptyDraft()
    expect(draft.location.livesInHuntsvilleArea).toBeNull()
    const missing = collectApplicationValidationIssues(draft).find(
      (item) => item.code === 'lives_in_huntsville'
    )
    expect(missing?.stepId).toBe(2)
    draft.location.livesInHuntsvilleArea = false
    expect(
      collectApplicationValidationIssues(draft).some(
        (item) => item.code === 'lives_in_huntsville'
      )
    ).toBe(false)
  })
})

describe('industry canonical source', () => {
  it('uses the same options and values as the Business Directory application', () => {
    expect(INDUSTRY_OPTIONS).toBe(BUSINESS_LISTING_INDUSTRIES)
    expect(INDUSTRY_OPTIONS.map((option) => option.value)).toEqual(
      BUSINESS_LISTING_INDUSTRIES.map((option) => option.value)
    )
    expect(parseIndustryValue('technology')).toBe('technology')
    expect(formSource()).toContain('INDUSTRY_OPTIONS')
    expect(formSource()).toContain('Select an industry')
    expect(collapsedFormSource()).toContain(
      'Employer details stay private unless you choose to share them later.'
    )
    expect(formSource()).not.toContain(
      "Helps reviewers understand how you'll contribute"
    )
  })

  it('requires a canonical industry at step 3 and on final submit', () => {
    const draft = parseApplicationDraft({
      version: 2,
      step: 3,
      profile: { connectionIntents: ['friends'] },
      workAndInterests: { industry: '', interests: ['Arts & culture'] },
    })
    const stepIssues = validateApplicationStep(draft, 3)
    expect(stepIssues.some((item) => item.code === 'industry')).toBe(true)
    const industryIssue = collectApplicationValidationIssues(draft).find(
      (item) => item.code === 'industry'
    )
    expect(industryIssue?.message).toBe(
      'Go back to Step 3: Work & interests and select an industry.'
    )

    draft.workAndInterests.industry = 'technology'
    expect(
      collectApplicationValidationIssues(draft).some(
        (item) => item.code === 'industry'
      )
    ).toBe(false)
  })

  it('loads legacy free-text industry values without erasing them', () => {
    const draft = parseApplicationDraft({
      version: 2,
      step: 3,
      workAndInterests: { industry: 'Aerospace' },
    })
    expect(draft.workAndInterests.industry).toBe('Aerospace')
    expect(parseIndustryValue(draft.workAndInterests.industry)).toBeNull()
    expect(
      collectApplicationValidationIssues(draft).some(
        (item) => item.code === 'industry'
      )
    ).toBe(true)
  })
})

describe('member directory industry filter', () => {
  const members = [
    stubMember({
      id: 'tech',
      full_name: 'Taylor Tech',
      discovery_industry: 'technology',
    }),
    stubMember({
      id: 'food',
      full_name: 'Frankie Food',
      discovery_industry: 'food_beverage',
    }),
    stubMember({
      id: 'legacy',
      full_name: 'Legacy Label',
      discovery_industry: 'Technology',
    }),
    stubMember({
      id: 'none',
      full_name: 'No Industry',
      discovery_industry: null,
    }),
  ]

  it('filters by canonical slug using directory-safe discovery_industry only', () => {
    const filtered = filterDirectoryMembers(members, {
      ...DEFAULT_DISCOVERY_FILTERS,
      industryFilter: 'technology',
    })
    expect(filtered.map((member) => member.id).sort()).toEqual(['legacy', 'tech'])
  })

  it('keeps other filters and default name ordering', () => {
    const byIntent = filterDirectoryMembers(
      [
        stubMember({
          id: 'dating',
          public_intents: ['dating'],
          discovery_industry: 'technology',
        }),
        stubMember({
          id: 'friends',
          public_intents: ['friends'],
          discovery_industry: 'technology',
        }),
      ],
      { ...DEFAULT_DISCOVERY_FILTERS, industryFilter: 'technology', intentFilter: 'friends' }
    )
    expect(byIntent.map((member) => member.id)).toEqual(['friends'])

    const sorted = sortDirectoryMembers(members, 'name')
    expect(sorted.map((member) => member.full_name)).toEqual([
      'Frankie Food',
      'Legacy Label',
      'No Industry',
      'Taylor Tech',
    ])
  })

  it('sorts Industry A–Z by canonical label then name', () => {
    const sorted = sortDirectoryMembers(members, 'industry')
    expect(sorted.map((member) => member.id)).toEqual([
      'food',
      'tech',
      'none',
      'legacy',
    ])
  })
})

describe('review preview notice', () => {
  it('removes the redundant Profile preview heading and uses the approved notice', () => {
    const source = previewSource()
    expect(source).not.toContain('Profile preview')
    expect(source).not.toContain(
      'Review your public name, About Me, details, and photos before you submit.'
    )
    expect(APPLICATION_REVIEW_PREVIEW_NOTICE).toBe(
      'Your profile will stay private until your identity has been verified and membership is approved. Review your public facing profile preview below. This is how other members will see you in the directory.'
    )
    expect(source).toContain('APPLICATION_REVIEW_PREVIEW_NOTICE')
    expect(collapsedFormSource()).toContain(
      'Preview your public profile, confirm the summary, then submit for membership review.'
    )
  })
})

describe('final-step error mapping', () => {
  it('uses configured step metadata for interests and primary-photo errors', () => {
    expect(applicationStepTitle(3)).toBe('Work & interests')
    expect(applicationStepTitle(5)).toBe('Photos')
    expect(APPLICATION_FORM_STEPS[2]?.id).toBe(3)

    const draft = emptyDraft()
    draft.workAndInterests.interests = []
    const interests = collectApplicationValidationIssues(draft).find(
      (item) => item.code === 'interests_min'
    )
    expect(interests?.message).toBe(
      'Go back to Step 3: Work & interests and select at least 3 interests.'
    )
    expect(interests?.stepId).toBe(3)
    expect(interests?.message.startsWith(applicationGoBackToStepPrefix(3))).toBe(
      true
    )

    draft.photos = [
      {
        id: 'p1',
        storagePath: 'photos/p1.jpg',
        isPrimary: true,
        facePhotoConfirmed: false,
      },
    ]
    const photo = collectApplicationValidationIssues(draft).find(
      (item) => item.code === 'primary_photo_headshot'
    )
    expect(photo?.message).toBe(
      'Go back to Step 5: Photos and verify that your primary photo is a clear headshot.'
    )
    expect(photo?.stepId).toBe(5)
  })

  it('keeps server validation as a string of the first mapped issue', () => {
    const message = validateApplicationForSubmit(emptyDraft())
    expect(message).toContain('Go back to Step')
    expect(formSource()).toContain('goToIssue')
    expect(formSource()).toContain('collectApplicationValidationIssues')
    expect(formSource()).toContain('saveApplicationDraft')
    expect(formSource()).toContain('submitApplication')
  })
})
