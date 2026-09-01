export default function MembershipPerkLines({
  lines,
  className = 'text-sm leading-relaxed break-words text-muted-foreground',
}: {
  lines: string[]
  className?: string
}) {
  if (lines.length === 0) return null

  return (
    <div className="min-w-0 max-w-full space-y-2" aria-live="polite">
      {lines.map((line) => (
        <p key={line} className={className}>
          {line}
        </p>
      ))}
    </div>
  )
}
