/** Shared form + button classes — gold CTA on dark canvas. */

export const inputClassName =
  'min-h-11 w-full min-w-0 rounded-full border border-border bg-surface-elevated px-4 py-2.5 font-sans text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20'

export const textareaClassName =
  'min-h-[7.5rem] w-full min-w-0 resize-y rounded-2xl border border-border bg-surface-elevated px-4 py-3 font-sans text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20'

export const buttonPrimaryClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 py-2.5 font-brand text-sm font-semibold text-accent-foreground shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50'

export const buttonSecondaryClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-accent/50 bg-transparent px-5 py-2.5 font-brand text-sm font-medium text-accent transition hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50'

/** Visually muted + non-interactive look for blocked actions (e.g. ineligible Going). */
export const buttonDisabledMutedClassName =
  'inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-full border border-border bg-muted px-5 py-2.5 font-brand text-sm font-medium text-muted-foreground opacity-70'

export const buttonGoldClassName = buttonPrimaryClassName

/** Stretch primary/secondary actions on narrow screens; keep auto width from sm up. */
export const mobileFullButtonClassName = 'w-full sm:w-auto'

/** Marketing / public pages — matches Lovable prototype (rounded-md, hero overlays). */
export const marketingButtonPrimaryClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 py-3 text-sm font-medium tracking-wide whitespace-nowrap text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6'

export const marketingButtonSecondaryClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-white/40 px-5 py-3 text-sm font-medium tracking-wide whitespace-nowrap text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6'

export const marketingNavLinkClassName =
  'inline-flex min-h-11 items-center px-2 py-2 text-xs font-medium uppercase tracking-wide text-white/80 transition hover:text-white sm:px-3 sm:tracking-widest'

export const chipActiveClassName =
  'inline-flex min-h-11 max-w-full items-center rounded-full border border-accent bg-accent px-3.5 py-2 text-left font-brand text-xs font-medium break-words whitespace-normal text-accent-foreground'

export const chipInactiveClassName =
  'inline-flex min-h-11 max-w-full items-center rounded-full border border-border bg-surface px-3.5 py-2 text-left font-brand text-xs font-medium break-words whitespace-normal text-muted-foreground transition hover:border-accent/40 hover:bg-accent-soft hover:text-foreground'

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
