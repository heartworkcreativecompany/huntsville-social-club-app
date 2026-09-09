import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChipMultiSelect from '@/components/application/chip-multi-select'
import {
  chipOptionsWithLegacySelected,
  isChipSelected,
  logicalChipCount,
  toggleChipSelection,
} from '@/lib/chip-selection'
import { emptyDraft, parseApplicationDraft } from '@/lib/application'
import {
  EVENT_INTEREST_OPTIONS,
  INTEREST_MAX,
  INTEREST_MIN,
  INTEREST_OPTIONS,
  INTEREST_SELECTION_HINT,
} from '@/lib/application-form-content'
import { collectApplicationValidationIssues } from '@/lib/application-validation'

describe('chipOptionsWithLegacySelected', () => {
  it('appends saved labels that are no longer selectable options', () => {
    expect(
      chipOptionsWithLegacySelected(INTEREST_OPTIONS, [
        'Games & hobbies',
        'Travel',
      ])
    ).toEqual([...INTEREST_OPTIONS, 'Games & hobbies'])
  })

  it('does not add Games & hobbies unless it is already selected', () => {
    expect(
      chipOptionsWithLegacySelected(INTEREST_OPTIONS, ['Travel'])
    ).toEqual([...INTEREST_OPTIONS])
  })

  it('keeps Games & hobbies and Games & Hobbies as visible legacy chips', () => {
    expect(
      chipOptionsWithLegacySelected(INTEREST_OPTIONS, ['Games & hobbies'])
    ).toContain('Games & hobbies')
    expect(
      chipOptionsWithLegacySelected(INTEREST_OPTIONS, ['Games & Hobbies'])
    ).toContain('Games & Hobbies')
    expect(INTEREST_OPTIONS).not.toContain('Games & hobbies')
    expect(INTEREST_OPTIONS).not.toContain('Games & Hobbies')
  })

  it('renders one Family & Parenting chip for a stored Family & parenting value', () => {
    const visible = chipOptionsWithLegacySelected(INTEREST_OPTIONS, [
      'Family & parenting',
      'Travel',
      'Photography',
    ])
    expect(visible.filter((item) => /family & parenting/i.test(item))).toEqual([
      'Family & Parenting',
    ])
    expect(visible).not.toContain('Family & parenting')
  })

  it('collapses case and outer-whitespace variants of a catalog option', () => {
    const visible = chipOptionsWithLegacySelected(INTEREST_OPTIONS, [
      '  family & parenting  ',
      'Family & Parenting',
    ])
    expect(visible.filter((item) => /family & parenting/i.test(item))).toEqual([
      'Family & Parenting',
    ])
  })

  it('keeps truly different labels separate', () => {
    const visible = chipOptionsWithLegacySelected(INTEREST_OPTIONS, [
      'Games & hobbies',
      'Board Games',
      'Video Games',
    ])
    expect(visible).toContain('Games & hobbies')
    expect(visible).toContain('Board Games')
    expect(visible).toContain('Video Games')
  })

  it('keeps unmatched event-interest history as a legacy chip', () => {
    expect(
      chipOptionsWithLegacySelected(EVENT_INTEREST_OPTIONS, [
        'Small dinners',
        'Game nights',
      ])
    ).toEqual([...EVENT_INTEREST_OPTIONS, 'Small dinners'])
  })
})

describe('toggleChipSelection', () => {
  it('can select Board Games and Video Games together', () => {
    const withBoard = toggleChipSelection([], 'Board Games', INTEREST_MAX)
    const withBoth = toggleChipSelection(
      withBoard,
      'Video Games',
      INTEREST_MAX
    )
    expect(withBoth).toEqual(['Board Games', 'Video Games'])
  })

  it('rejects a seventh member interest while allowing deselection', () => {
    const six = [
      'Travel',
      'Photography',
      'Family & Parenting',
      'Board Games',
      'Video Games',
      'Books & Reading',
    ]
    expect(toggleChipSelection(six, 'Arts & Crafts', INTEREST_MAX)).toEqual(six)
    expect(toggleChipSelection(six, 'Travel', INTEREST_MAX)).toEqual(six.slice(1))
  })

  it('does not duplicate Family & Parenting when Family & parenting is already stored', () => {
    const stored = ['Family & parenting', 'Travel', 'Photography']
    expect(
      toggleChipSelection(stored, 'Family & Parenting', INTEREST_MAX)
    ).toEqual(['Travel', 'Photography'])
    expect(logicalChipCount(stored)).toBe(3)
    expect(toggleChipSelection(stored, 'Family & Parenting', INTEREST_MAX)).not.toContain(
      'Family & parenting'
    )
    expect(toggleChipSelection(stored, 'Family & Parenting', INTEREST_MAX)).not.toContain(
      'Family & Parenting'
    )
  })

  it('counts a stored Family & parenting value once toward the 3–6 cap', () => {
    const six = [
      'Family & parenting',
      'Travel',
      'Photography',
      'Board Games',
      'Video Games',
      'Books & Reading',
    ]
    expect(logicalChipCount(six)).toBe(6)
    expect(toggleChipSelection(six, 'Arts & Crafts', INTEREST_MAX)).toEqual(six)
    expect(
      isChipSelected(six, 'Family & Parenting')
    ).toBe(true)
  })

  it('allows zero or many event interests without a maximum', () => {
    expect(toggleChipSelection([], EVENT_INTEREST_OPTIONS[0])).toEqual([
      EVENT_INTEREST_OPTIONS[0],
    ])
    expect(
      toggleChipSelection([...EVENT_INTEREST_OPTIONS], 'Game nights')
    ).toHaveLength(EVENT_INTEREST_OPTIONS.length - 1)
    expect(toggleChipSelection(['Game nights'], 'Game nights')).toEqual([])
    expect(
      toggleChipSelection(['Small dinners', 'Game nights'], 'Small dinners')
    ).toEqual(['Game nights'])
  })
})

describe('canonical interest identity', () => {
  it('does not rewrite stored spelling just by inspecting the selection', () => {
    const stored = ['Family & parenting', 'Travel', 'Photography']
    chipOptionsWithLegacySelected(INTEREST_OPTIONS, stored)
    logicalChipCount(stored)
    isChipSelected(stored, 'Family & Parenting')
    expect(stored).toEqual(['Family & parenting', 'Travel', 'Photography'])

    const draft = parseApplicationDraft({
      version: 2,
      workAndInterests: { interests: stored },
    })
    expect(draft.workAndInterests.interests).toEqual(stored)
  })

  it('treats logically unique values for the existing 3–6 rule', () => {
    const draft = emptyDraft()
    draft.workAndInterests.interests = [
      'Family & parenting',
      'Family & Parenting',
      'Travel',
      'Photography',
    ]
    expect(logicalChipCount(draft.workAndInterests.interests)).toBe(3)
    expect(
      collectApplicationValidationIssues(draft).some(
        (item) =>
          item.code === 'interests_min' || item.code === 'interests_max'
      )
    ).toBe(false)

    draft.workAndInterests.interests = ['Travel', 'Photography']
    expect(
      collectApplicationValidationIssues(draft).some(
        (item) => item.code === 'interests_min'
      )
    ).toBe(true)
  })
})

describe('Family & parenting chip rendering', () => {
  it('renders one selected Family & Parenting chip for stored Family & parenting', () => {
    const html = renderToStaticMarkup(
      createElement(ChipMultiSelect, {
        options: INTEREST_OPTIONS,
        selected: ['Family & parenting', 'Travel', 'Photography'],
        onChange: () => undefined,
        min: INTEREST_MIN,
        max: INTEREST_MAX,
        hint: INTEREST_SELECTION_HINT,
      })
    )

    expect(html).toContain('Family &amp; Parenting')
    expect(html).not.toContain('Family &amp; parenting')
    expect(html).toContain('3 selected')
    const parentIndex = html.indexOf('Family &amp; Parenting')
    const parentButton = html.slice(
      html.lastIndexOf('<button', parentIndex),
      html.indexOf('</button>', parentIndex)
    )
    expect(parentButton).toContain('aria-pressed="true"')
  })
})
