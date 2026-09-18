import { describe, expect, it } from 'vitest'
import {
  eventDescriptionExcerpt,
  persistEventDescription,
  splitEventDescriptionParagraphs,
} from '@/lib/event-description'

describe('splitEventDescriptionParagraphs', () => {
  it('splits two paragraphs separated by \\n\\n', () => {
    expect(
      splitEventDescriptionParagraphs('First paragraph.\n\nSecond paragraph.')
    ).toEqual([['First paragraph.'], ['Second paragraph.']])
  })

  it('splits paragraphs separated by Windows \\r\\n\\r\\n', () => {
    expect(
      splitEventDescriptionParagraphs(
        'First paragraph.\r\n\r\nSecond paragraph.'
      )
    ).toEqual([['First paragraph.'], ['Second paragraph.']])
  })

  it('ignores repeated blank lines', () => {
    expect(
      splitEventDescriptionParagraphs('One.\n\n\n\nTwo.')
    ).toEqual([['One.'], ['Two.']])
  })

  it('ignores leading and trailing newlines', () => {
    expect(
      splitEventDescriptionParagraphs('\n\nHello club.\n\n')
    ).toEqual([['Hello club.']])
  })

  it('keeps a one-paragraph description as one paragraph', () => {
    expect(
      splitEventDescriptionParagraphs('Just one paragraph of copy.')
    ).toEqual([['Just one paragraph of copy.']])
  })

  it('keeps single line breaks inside a paragraph', () => {
    expect(
      splitEventDescriptionParagraphs('Line one\nLine two\n\nNext section')
    ).toEqual([['Line one', 'Line two'], ['Next section']])
  })
})

describe('persistEventDescription', () => {
  it('keeps internal paragraph newlines exactly', () => {
    const value = 'First paragraph.\n\nSecond paragraph.'
    expect(persistEventDescription(`  ${value}\n`)).toBe(value)
    expect(persistEventDescription(value)).toBe(value)
    expect(persistEventDescription('   \n\n  ')).toBeNull()
    expect(persistEventDescription('')).toBeNull()
  })
})

describe('eventDescriptionExcerpt', () => {
  it('does not show literal newlines in a compact excerpt', () => {
    expect(
      eventDescriptionExcerpt('First paragraph.\n\nSecond paragraph.')
    ).toBe('First paragraph. Second paragraph.')
    expect(eventDescriptionExcerpt('First\r\n\r\nSecond')).toBe('First Second')
    expect(eventDescriptionExcerpt('First paragraph.\n\nSecond paragraph.')).not.toContain(
      '\\n'
    )
    expect(eventDescriptionExcerpt('First paragraph.\n\nSecond paragraph.')).not.toContain(
      '\n'
    )
  })
})
