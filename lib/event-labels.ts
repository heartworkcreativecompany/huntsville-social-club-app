export const inputClassName =
  'w-full rounded-lg border border-border bg-surface-elevated px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/15'

export const buttonPrimaryClassName =
  'inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'

export const buttonSecondaryClassName =
  'inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-border-strong hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50'

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function eventStatusLabel(status: string | null | undefined): string {
  const value = status ?? 'published'
  if (value === 'draft') return 'Draft'
  if (value === 'cancelled') return 'Cancelled'
  return 'Published'
}

export function roleLabel(role: string | null | undefined): string {
  const value = role ?? 'member'
  if (value === 'admin') return 'Administrator'
  if (value === 'host') return 'Host'
  return 'Member'
}
