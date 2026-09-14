import {
  FOUNDER_NOTE_PLACEHOLDER_BODY,
  FOUNDER_NOTE_PLACEHOLDER_EYEBROW,
  FOUNDER_NOTE_PLACEHOLDER_HEADLINE,
} from '@/lib/marketing-home-copy'

/** Reserved public slot — does not render quotes, names, or invented social proof. */
export default function FounderNotePlaceholder() {
  return (
    <aside
      aria-label="Reserved for a future founder note"
      className="rounded-2xl border border-dashed border-accent/35 bg-surface/60 px-6 py-10 text-center sm:px-10"
    >
      <p className="hero-eyebrow justify-center">
        <span className="hero-eyebrow-line" aria-hidden />
        {FOUNDER_NOTE_PLACEHOLDER_EYEBROW}
      </p>
      <h2 className="font-brand mt-4 text-2xl font-semibold text-foreground sm:text-3xl">
        {FOUNDER_NOTE_PLACEHOLDER_HEADLINE}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        {FOUNDER_NOTE_PLACEHOLDER_BODY}
      </p>
    </aside>
  )
}
