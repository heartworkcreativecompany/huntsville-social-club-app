export default function Card({
  children,
  className = '',
  padding = 'md',
}: {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'none'
}) {
  const paddingClass =
    padding === 'sm'
      ? 'p-4'
      : padding === 'none'
        ? ''
        : 'p-5 sm:p-6'

  return (
    <div
      className={`rounded-lg border border-border bg-surface shadow-sm ${paddingClass} ${className}`}
    >
      {children}
    </div>
  )
}
