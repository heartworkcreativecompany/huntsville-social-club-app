import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EventDescription from '@/components/events/event-description'
import { persistEventDescription } from '@/lib/event-description'

function paragraphCount(html: string): number {
  return (html.match(/<p\b/g) ?? []).length
}

describe('EventDescription', () => {
  it('renders two semantic paragraphs for \\n\\n', () => {
    const html = renderToStaticMarkup(
      createElement(EventDescription, {
        text: 'First paragraph.\n\nSecond paragraph.',
      })
    )

    expect(paragraphCount(html)).toBe(2)
    expect(html).toContain('>First paragraph.</p>')
    expect(html).toContain('>Second paragraph.</p>')
    expect(html).not.toContain('dangerouslySetInnerHTML')
  })

  it('renders the same two paragraphs for \\r\\n\\r\\n', () => {
    const html = renderToStaticMarkup(
      createElement(EventDescription, {
        text: 'First paragraph.\r\n\r\nSecond paragraph.',
      })
    )

    expect(paragraphCount(html)).toBe(2)
    expect(html).toContain('>First paragraph.</p>')
    expect(html).toContain('>Second paragraph.</p>')
  })

  it('does not create empty paragraphs from repeated or surrounding blank lines', () => {
    const html = renderToStaticMarkup(
      createElement(EventDescription, {
        text: '\n\nFirst.\n\n\n\nSecond.\n\n',
      })
    )

    expect(paragraphCount(html)).toBe(2)
    expect(html).not.toContain('<p></p>')
    expect(html).not.toContain('<p><br/></p>')
  })

  it('renders a one-paragraph description as one paragraph', () => {
    const html = renderToStaticMarkup(
      createElement(EventDescription, {
        text: 'Just one paragraph of copy.',
      })
    )

    expect(paragraphCount(html)).toBe(1)
    expect(html).toContain('>Just one paragraph of copy.</p>')
  })

  it('preserves single line breaks inside a paragraph as br', () => {
    const html = renderToStaticMarkup(
      createElement(EventDescription, {
        text: 'Line one\nLine two\n\nNext section',
      })
    )

    expect(paragraphCount(html)).toBe(2)
    expect(html).toMatch(/Line one<br\/?>Line two/)
    expect(html).toContain('>Next section</p>')
  })

  it('renders HTML-like characters as text, not HTML', () => {
    const html = renderToStaticMarkup(
      createElement(EventDescription, {
        text: 'Bring <script>alert(1)</script> & snacks.',
      })
    )

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&amp;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})

describe('event description storage and forms', () => {
  it('retains paragraph newlines on persist and in server actions', () => {
    const value = 'First paragraph.\n\nSecond paragraph.'
    expect(persistEventDescription(`\n${value}\n`)).toBe(value)

    const actions = readFileSync(
      join(process.cwd(), 'app/(club)/events/actions.ts'),
      'utf8'
    )
    expect(actions).toContain('persistEventDescription')
    expect(actions).not.toMatch(
      /description:\s*input\.description\?\.replace\(/
    )
  })

  it('uses a multiline description field with paragraph helper text', () => {
    const files = [
      'app/(club)/events/event-form.tsx',
      'app/(club)/events/event-edit-form.tsx',
      'app/(club)/events/event-inline-edit.tsx',
    ]

    for (const relative of files) {
      const source = readFileSync(join(process.cwd(), relative), 'utf8')
      expect(source).toContain('<textarea')
      expect(source).toContain('Use blank lines to separate paragraphs.')
    }
  })
})

describe('compact event cards', () => {
  it('does not render stored newlines as visible \\n in card previews', () => {
    const listCard = readFileSync(
      join(process.cwd(), 'components/events/event-list-card.tsx'),
      'utf8'
    )
    const richCard = readFileSync(
      join(process.cwd(), 'components/events/event-rich-card.tsx'),
      'utf8'
    )

    expect(listCard).not.toMatch(/\{event\.description\}/)
    expect(richCard).not.toMatch(/\{event\.description\}/)
  })
})
