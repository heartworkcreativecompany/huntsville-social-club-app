type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'

const variantClass: Record<BadgeVariant, string> = {
  default: 'bg-accent-soft text-foreground',
  accent: 'bg-accent text-accent-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-background text-muted-foreground border border-border',
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
