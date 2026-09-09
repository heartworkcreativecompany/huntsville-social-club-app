import { describe, expect, it } from 'vitest'
import {
  chipOptionsWithLegacySelected,
  toggleChipSelection,
} from '@/lib/chip-selection'
import {
  EVENT_INTEREST_OPTIONS,
  INTEREST_MAX,
  INTEREST_OPTIONS,
} from '@/lib/application-form-content'

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

  it('allows zero or many event interests without a maximum', () => {
    expect(toggleChipSelection([], EVENT_INTEREST_OPTIONS[0])).toEqual([
      EVENT_INTEREST_OPTIONS[0],
    ])
    expect(
      toggleChipSelection([...EVENT_INTEREST_OPTIONS], 'Game nights')
    ).toHaveLength(EVENT_INTEREST_OPTIONS.length - 1)
    expect(toggleChipSelection(['Game nights'], 'Game nights')).toEqual([])
  })
})
