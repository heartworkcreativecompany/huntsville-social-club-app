export default function HowCompatibilityWorksContent() {
  return (
    <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
      <section>
        <h2 className="text-display text-base font-semibold text-foreground">
          Curated, not a swipe feed
        </h2>
        <p className="mt-2">
          Huntsville Social Club recommends a small number of members at a time —
          people we think could be a strong fit based on what you have shared with
          the club. You stay in control: review each recommendation, request an
          intro when it feels right, or pass and move on.
        </p>
      </section>

      <section>
        <h2 className="text-display text-base font-semibold text-foreground">
          What we look at
        </h2>
        <p className="mt-2">
          Recommendations weigh signals you have already shared — never raw private
          answers on their own. We consider things like:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Shared interests on your public profiles</li>
          <li>Whether you are in a similar local area</li>
          <li>Alignment on relationship goals from your private questionnaire</li>
          <li>Compatibility in communication style from your private questionnaire</li>
          <li>Other profile context that helps us understand fit</li>
        </ul>
        <p className="mt-3">
          When a match appears in your inbox, you may see a short &ldquo;Why this
          match&rdquo; summary — for example, shared interests or similar goals.
          These are simple highlights, not a full breakdown of anyone&apos;s
          answers.
        </p>
      </section>

      <section>
        <h2 className="text-display text-base font-semibold text-foreground">
          Your questionnaire stays private
        </h2>
        <p className="mt-2">
          Your compatibility questionnaire is only used behind the scenes to
          improve recommendations. It is not posted on your public profile, shown
          on match cards, or shared verbatim with other members.
        </p>
      </section>

      <section>
        <h2 className="text-display text-base font-semibold text-foreground">
          Why some cycles have no matches
        </h2>
        <p className="mt-2">
          Not every review produces new recommendations — and that is normal. We
          only surface matches when we see a stronger fit, and we skip people who
          are unavailable, already connected, or not a good match right now.
        </p>
        <p className="mt-2">
          If your inbox is empty, it usually means we are still looking, waiting
          for the next review cycle, or holding out for a better fit rather than
          sending filler matches.
        </p>
      </section>
    </div>
  )
}
