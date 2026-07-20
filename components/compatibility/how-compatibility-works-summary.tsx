import Link from 'next/link'

const INLINE_SUMMARY_POINTS = [
  'Small-batch curated recommendations — not a swipe feed.',
  'Your questionnaire answers stay private and off your public profile.',
  'An empty inbox between cycles is normal when we hold out for a stronger fit.',
] as const

export default function HowCompatibilityWorksInlineSummary({
  className = '',
  showLink = true,
}: {
  className?: string
  showLink?: boolean
}) {
  return (
    <div className={className}>
      <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
        {INLINE_SUMMARY_POINTS.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="text-muted" aria-hidden>
              ·
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
      {showLink ? (
        <Link
          href="/compatibility/how-it-works"
          className="mt-3 inline-flex text-sm font-medium text-accent underline"
        >
          How compatibility works
        </Link>
      ) : null}
    </div>
  )
}
