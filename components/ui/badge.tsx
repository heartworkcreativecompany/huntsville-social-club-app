type BadgeVariant =
  | 'default'
  | 'accent'
  | 'premium'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'

const variantClass: Record<BadgeVariant, string> = {
  default: 'bg-accent-soft text-foreground border border-border',
  accent: 'bg-accent text-accent-foreground border border-accent font-brand',
  premium: 'bg-accent-soft text-accent border border-accent/50 font-brand',
  success: 'bg-success-soft text-success border border-success/25',
  warning: 'bg-accent-soft text-accent border border-accent/40',
  danger: 'bg-danger-soft text-danger border border-danger/25',
  muted: 'bg-surface-elevated text-muted-foreground border border-border',
}

export default function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode
  variant?: BadgeVariant
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClass[variant]}`}
    >
      {children}
    </span>
  )
}
