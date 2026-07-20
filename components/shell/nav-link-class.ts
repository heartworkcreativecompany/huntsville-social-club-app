export function navLinkClassName(active: boolean): string {
  return `rounded-full px-3.5 py-2 font-brand text-sm font-medium transition ${
    active
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-accent-soft hover:text-accent'
  }`
}
