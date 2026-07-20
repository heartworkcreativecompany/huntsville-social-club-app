type BadgeVariant =
  | 'default'
  | 'accent'
  | 'premium'
  | 'trust'
  | 'category'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'

const variantClass: Record<BadgeVariant, string> = {
  default: 'bg-accent-soft text-foreground border border-border',
  accent: 'bg-accent text-accent-foreground border border-accent font-brand',
  premium:
    'bg-accent-soft text-accent border border-accent/50 font-brand',
  trust: 'bg-success-soft text-success border border-success/25',
  category:
    'bg-surface-elevated text-muted border border-border-strong/70',
  success: 'bg-success-soft text-success border border-success/25',
  warning: 'bg-accent-soft text-accent border border-accent/40',
  danger: 'bg-danger-soft text-danger border border-danger/25',
  muted: 'bg-surface-elevated text-muted-foreground border border-border',
}

export type { BadgeVariant }

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
