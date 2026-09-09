import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChipMultiSelect from '@/components/application/chip-multi-select'
import { emptyDraft, parseApplicationDraft } from '@/lib/application'
import {
  EVENT_INTEREST_HEADING,
  EVENT_INTEREST_HINT,
  EVENT_INTEREST_OPTIONS,
  INTEREST_MAX,
  INTEREST_MIN,
  INTEREST_OPTIONS,
  INTEREST_SELECTION_HINT,
} from '@/lib/application-form-content'
import { collectApplicationValidationIssues } from '@/lib/application-validation'
import { publicProfileDetailsFromDraft } from '@/lib/profile-public-display'

const repoRoot = join(__dirname, '..')

const APPROVED_MEMBER_INTERESTS = [
  'Animals & Pets',
  'Arts & Crafts',
  'Board Games',
  'Books & Reading',
  'Coffee & Cafés',
  'Comedy & Live Entertainment',
  'Cooking & Baking',
  'Culture, Museums & Local History',
  'Dining Out & Trying New Restaurants',
  'Faith & Spirituality',
  'Family & Parenting',
  'Farmers Markets & Local Shopping',
  'Fitness & Wellness',
  'Food, Wine & Tastings',
  'Hiking, Walking & Nature',
  'Live Music & Concerts',
  'Movies & TV',
  'Networking & Entrepreneurship',
  'Outdoor Adventures',
  'Personal Growth & Learning',
  'Photography',
  'Recreational Sports',
  'Travel',
  'Trivia & Puzzles',
  'Video Games',
  'Volunteering & Community Service',
] as const

const APPROVED_EVENT_INTERESTS = [
  'Low-key coffee or conversation',
  'Small-group activities',
  'Game nights',
  'Outdoor meetups',
  'Creative workshops',
  'Live events',
  'Volunteer/community activities',
  'Professional networking',
  'Larger social gatherings',
] as const

function applicationFormSource() {
  return readFileSync(
    join(repoRoot, 'app/(club)/application/application-form.tsx'),
    'utf8'
  )
}

function profileFormSource() {
  return readFileSync(
    join(repoRoot, 'app/(club)/members/profile-form.tsx'),
    'utf8'
  )
}

describe('member interest options', () => {
  it('exposes all 26 approved labels exactly from the shared source of truth', () => {
    expect(INTEREST_OPTIONS).toEqual(APPROVED_MEMBER_INTERESTS)
    expect(INTEREST_OPTIONS).toHaveLength(26)
    expect(INTEREST_SELECTION_HINT).toBe('Choose 3–6 interests')
    expect(INTEREST_MIN).toBe(3)
    expect(INTEREST_MAX).toBe(6)
  })

  it('does not offer Games & Hobbies for new selection', () => {
    expect(INTEREST_OPTIONS).not.toContain('Games & Hobbies')
    expect(INTEREST_OPTIONS).not.toContain('Games & hobbies')
  })

  it('keeps Travel, Photography, Family & Parenting, Board Games, and Video Games selectable', () => {
    expect(INTEREST_OPTIONS).toContain('Travel')
    expect(INTEREST_OPTIONS).toContain('Photography')
    expect(INTEREST_OPTIONS).toContain('Family & Parenting')
    expect(INTEREST_OPTIONS).toContain('Board Games')
    expect(INTEREST_OPTIONS).toContain('Video Games')
  })

  it('uses the shared list on application and profile forms', () => {
    expect(applicationFormSource()).toContain('INTEREST_OPTIONS')
    expect(applicationFormSource()).toContain('INTEREST_SELECTION_HINT')
    expect(profileFormSource()).toContain('INTEREST_OPTIONS')
    expect(profileFormSource()).toContain('INTEREST_SELECTION_HINT')
    expect(applicationFormSource()).not.toContain('Games & Hobbies')
    expect(applicationFormSource()).not.toContain('Games & hobbies')
    expect(profileFormSource()).not.toContain('Games & Hobbies')
    expect(profileFormSource()).not.toContain('Games & hobbies')
  })
})

describe('member interest validation', () => {
  it('still rejects fewer than 3 and more than 6 interests', () => {
    const tooFew = emptyDraft()
    tooFew.workAndInterests.interests = ['Travel', 'Photography']
    expect(
      collectApplicationValidationIssues(tooFew).some(
        (item) => item.code === 'interests_min'
      )
    ).toBe(true)

    const tooMany = emptyDraft()
    tooMany.workAndInterests.interests = [
      'Travel',
      'Photography',
      'Family & Parenting',
      'Board Games',
      'Video Games',
      'Books & Reading',
      'Arts & Crafts',
    ]
    expect(
      collectApplicationValidationIssues(tooMany).some(
        (item) => item.code === 'interests_max'
      )
    ).toBe(true)

    const valid = emptyDraft()
    valid.workAndInterests.interests = [
      'Travel',
      'Photography',
      'Family & Parenting',
    ]
    expect(
      collectApplicationValidationIssues(valid).some(
        (item) =>
          item.code === 'interests_min' || item.code === 'interests_max'
      )
    ).toBe(false)
  })

  it('does not apply the 3–6 rule to event interests', () => {
    const draft = emptyDraft()
    draft.workAndInterests.interests = [
      'Travel',
      'Photography',
      'Family & Parenting',
    ]
    draft.workAndInterests.eventInterests = []
    const emptyEventIssues = collectApplicationValidationIssues(draft)
    expect(
      emptyEventIssues.some((item) => item.code.startsWith('event_interest'))
    ).toBe(false)

    draft.workAndInterests.eventInterests = [...EVENT_INTEREST_OPTIONS]
    const manyEventIssues = collectApplicationValidationIssues(draft)
    expect(
      manyEventIssues.some((item) => item.code.startsWith('event_interest'))
    ).toBe(false)
  })
})

describe('legacy Games & hobbies compatibility', () => {
  it('keeps a saved Games & hobbies value readable on draft resume and public display', () => {
    const draft = parseApplicationDraft({
      version: 2,
      step: 3,
      workAndInterests: {
        interests: ['Games & hobbies', 'Travel', 'Photography'],
      },
    })

    expect(draft.workAndInterests.interests).toEqual([
      'Games & hobbies',
      'Travel',
      'Photography',
    ])
    expect(publicProfileDetailsFromDraft(draft).interests).toContain(
      'Games & hobbies'
    )
  })

  it('also displays the title-case Games & Hobbies label if already stored', () => {
    const draft = parseApplicationDraft({
      version: 2,
      workAndInterests: {
        interests: ['Games & Hobbies', 'Travel', 'Photography'],
      },
    })
    expect(draft.workAndInterests.interests).toContain('Games & Hobbies')
    expect(publicProfileDetailsFromDraft(draft).interests).toContain(
      'Games & Hobbies'
    )
  })

  it('does not remap Games & hobbies to Board Games or Video Games', () => {
    const draft = parseApplicationDraft({
      version: 2,
      workAndInterests: {
        interests: ['Games & hobbies', 'Travel', 'Photography'],
      },
    })
    expect(draft.workAndInterests.interests).not.toContain('Board Games')
    expect(draft.workAndInterests.interests).not.toContain('Video Games')
  })
})

describe('event interest matching wiring', () => {
  it('does not introduce event-interest matching, notification, or invitation behavior', () => {
    const scoring = readFileSync(
      join(repoRoot, 'lib/compatibility/scoring.ts'),
      'utf8'
    )
    expect(scoring).not.toContain('EVENT_INTEREST_OPTIONS')
    expect(scoring).not.toContain('eventInterests')

    const applicationForm = applicationFormSource()
    expect(applicationForm).not.toContain('auto-generate')
    expect(profileFormSource()).not.toContain('EVENT_TAG_OPTIONS')
  })
})

describe('event interest options', () => {
  it('exposes the nine approved event-interest labels exactly', () => {
    expect(EVENT_INTEREST_OPTIONS).toEqual(APPROVED_EVENT_INTERESTS)
    expect(EVENT_INTEREST_HEADING).toBe(
      'What kinds of events would you like to attend?'
    )
    expect(EVENT_INTEREST_HINT).toBe('Choose any that interest you.')
  })

  it('renders the approved heading and helper on application and profile forms', () => {
    const application = applicationFormSource()
    const profile = profileFormSource()
    expect(application).toContain('EVENT_INTEREST_HEADING')
    expect(application).toContain('EVENT_INTEREST_HINT')
    expect(profile).toContain('EVENT_INTEREST_HEADING')
    expect(profile).toContain('EVENT_INTEREST_HINT')
    expect(application).not.toMatch(
      /FieldLabel hint="Optional.">Event interests</
    )
  })

  it('persists zero or multiple event interests on draft save/resume', () => {
    const emptyEvents = parseApplicationDraft({
      version: 2,
      workAndInterests: { eventInterests: [] },
    })
    expect(emptyEvents.workAndInterests.eventInterests).toEqual([])

    const selected = [
      'Low-key coffee or conversation',
      'Game nights',
      'Larger social gatherings',
    ]
    const saved = parseApplicationDraft({
      version: 2,
      workAndInterests: { eventInterests: selected },
    })
    expect(saved.workAndInterests.eventInterests).toEqual(selected)
  })

  it('keeps previously saved event-interest labels readable after the option list change', () => {
    const draft = parseApplicationDraft({
      version: 2,
      workAndInterests: {
        eventInterests: [
          'Cultural outings',
          'Family-friendly events',
          'Members-only gatherings',
        ],
      },
    })
    expect(draft.workAndInterests.eventInterests).toEqual([
      'Cultural outings',
      'Family-friendly events',
      'Members-only gatherings',
    ])
    expect(publicProfileDetailsFromDraft(draft).eventInterests).toEqual([
      'Cultural outings',
      'Family-friendly events',
      'Members-only gatherings',
    ])
  })
})

describe('member interest chip rendering', () => {
  it('renders Board Games and Video Games, not Games & Hobbies, for new selection', () => {
    const html = renderToStaticMarkup(
      createElement(ChipMultiSelect, {
        options: INTEREST_OPTIONS,
        selected: [],
        onChange: () => undefined,
        min: INTEREST_MIN,
        max: INTEREST_MAX,
        hint: INTEREST_SELECTION_HINT,
        ariaLabel: 'Interests',
      })
    )

    expect(html).toContain('Choose 3–6 interests')
    expect(html).toContain('Board Games')
    expect(html).toContain('Video Games')
    expect(html).toContain('Travel')
    expect(html).toContain('Photography')
    expect(html).toContain('Family &amp; Parenting')
    expect(html).not.toContain('Games &amp; Hobbies')
    expect(html).not.toContain('Games &amp; hobbies')
    expect(html).toContain('aria-label="Interests"')
  })

  it('renders a saved Games & hobbies value as a selected chip without offering it as a new option', () => {
    const html = renderToStaticMarkup(
      createElement(ChipMultiSelect, {
        options: INTEREST_OPTIONS,
        selected: ['Games & hobbies', 'Travel', 'Photography'],
        onChange: () => undefined,
        min: INTEREST_MIN,
        max: INTEREST_MAX,
        hint: INTEREST_SELECTION_HINT,
      })
    )

    expect(html).toContain('Games &amp; hobbies')
    expect(html).toContain('aria-pressed="true"')
    const gamesIndex = html.indexOf('Games &amp; hobbies')
    const gamesButton = html.slice(
      html.lastIndexOf('<button', gamesIndex),
      html.indexOf('</button>', gamesIndex)
    )
    expect(gamesButton).toContain('aria-pressed="true"')
  })

  it('renders all nine event-interest choices and allows an empty selection', () => {
    const html = renderToStaticMarkup(
      createElement(ChipMultiSelect, {
        options: EVENT_INTEREST_OPTIONS,
        selected: [],
        onChange: () => undefined,
        ariaLabel: EVENT_INTEREST_HEADING,
      })
    )

    for (const option of EVENT_INTEREST_OPTIONS) {
      expect(html).toContain(option)
    }
    expect(html).not.toContain('Choose 3–6 interests')
  })

  it('renders multiple selected event interests', () => {
    const html = renderToStaticMarkup(
      createElement(ChipMultiSelect, {
        options: EVENT_INTEREST_OPTIONS,
        selected: ['Game nights', 'Outdoor meetups'],
        onChange: () => undefined,
      })
    )

    expect(html).toContain('Game nights')
    expect(html).toContain('Outdoor meetups')
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(2)
  })
})
