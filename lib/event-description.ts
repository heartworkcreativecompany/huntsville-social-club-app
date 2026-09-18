/**
 * Event description is stored as plain text. Paragraphs are blank-line separated.
 * Single newlines inside a paragraph are kept as line breaks on the detail page.
 */

export function persistEventDescription(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  return trimmed.length === 0 ? null : trimmed
}

function normalizeNewlines(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** Each paragraph is an ordered list of non-empty plain-text lines. */
export function splitEventDescriptionParagraphs(
  raw: string | null | undefined
): string[][] {
  if (raw == null) return []
  const normalized = normalizeNewlines(raw).trim()
  if (!normalized) return []

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0)
    )
    .filter((lines) => lines.length > 0)
}

export function eventDescriptionExcerpt(
  raw: string | null | undefined,
  maxLength = 160
): string {
  if (raw == null) return ''
  const collapsed = normalizeNewlines(raw).replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, maxLength).trimEnd()}…`
}
