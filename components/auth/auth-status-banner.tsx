export default function AuthStatusBanner({
  variant = 'success',
  title,
  children,
}: {
  variant?: 'success' | 'info'
  title?: string
  children: React.ReactNode
}) {
  const styles =
    variant === 'success'
      ? 'border-success/30 bg-success-soft/40 text-foreground'
      : 'border-accent/30 bg-accent-soft/40 text-foreground'

  return (
    <div
      className={`min-w-0 rounded-lg border px-4 py-3 text-sm leading-relaxed break-words ${styles}`}
      role="status"
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <p className={title ? 'mt-1 text-muted-foreground' : undefined}>
        {children}
      </p>
    </div>
  )
}
