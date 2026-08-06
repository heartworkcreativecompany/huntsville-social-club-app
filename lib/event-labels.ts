/** Shared form + button classes — gold CTA on dark canvas. */

export const inputClassName =
  'w-full rounded-full border border-border bg-surface-elevated px-4 py-2.5 font-sans text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20'

export const buttonPrimaryClassName =
  'inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 font-brand text-sm font-semibold text-accent-foreground shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50'

export const buttonSecondaryClassName =
  'inline-flex items-center justify-center rounded-full border border-accent/50 bg-transparent px-5 py-2.5 font-brand text-sm font-medium text-accent transition hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50'

/** Visually muted + non-interactive look for blocked actions (e.g. ineligible Going). */
export const buttonDisabledMutedClassName =
  'inline-flex cursor-not-allowed items-center justify-center rounded-full border border-border bg-muted px-5 py-2.5 font-brand text-sm font-medium text-muted-foreground opacity-70'

export const buttonGoldClassName = buttonPrimaryClassName

/** Marketing / public pages — matches Lovable prototype (rounded-md, hero overlays). */
export const marketingButtonPrimaryClassName =
  'inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 text-sm font-medium tracking-wide text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'

export const marketingButtonSecondaryClassName =
  'inline-flex items-center justify-center rounded-md border border-white/40 px-6 py-3 text-sm font-medium tracking-wide text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'

export const marketingNavLinkClassName =
  'hidden px-3 py-2 text-xs font-medium uppercase tracking-widest text-white/80 transition hover:text-white md:inline'

export const chipActiveClassName =
  'rounded-full border border-accent bg-accent px-3 py-1 font-brand text-xs font-medium text-accent-foreground'

export const chipInactiveClassName =
  'rounded-full border border-border bg-surface px-3 py-1 font-brand text-xs font-medium text-muted-foreground transition hover:border-accent/40 hover:bg-accent-soft hover:text-foreground'

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
