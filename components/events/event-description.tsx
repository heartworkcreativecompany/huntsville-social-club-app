import { Fragment } from 'react'
import { splitEventDescriptionParagraphs } from '@/lib/event-description'

export default function EventDescription({
  text,
}: {
  text: string | null | undefined
}) {
  const paragraphs = splitEventDescriptionParagraphs(text)
  if (paragraphs.length === 0) return null

  return (
    <div className="mb-8 max-w-2xl space-y-4">
      {paragraphs.map((lines, paragraphIndex) => (
        <p
          key={paragraphIndex}
          className="text-base leading-relaxed break-words text-foreground"
        >
          {lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}
