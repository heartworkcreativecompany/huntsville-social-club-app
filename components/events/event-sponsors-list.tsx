'use client'

import type { EventSponsorRecord } from '@/lib/event-sponsors'

export default function EventSponsorsList({
  sponsors,
}: {
  sponsors: EventSponsorRecord[]
}) {
  if (sponsors.length === 0) {
    return null
  }

  return (
    <section className="mb-8">
      <h2 className="text-display mb-4 text-xl font-medium text-foreground">
        {sponsors.length === 1 ? 'Sponsor' : 'Sponsors'}
      </h2>
      <ul className="flex flex-wrap gap-4">
        {sponsors.map((sponsor) => {
          const content = (
            <>
              {sponsor.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sponsor.logo_url}
                  alt=""
                  className="h-10 w-10 rounded-md object-contain"
                />
              ) : null}
              <span className="font-medium text-foreground">
                {sponsor.business_name}
              </span>
            </>
          )

          return (
            <li
              key={sponsor.id}
              className="flex min-w-[10rem] items-center gap-3 rounded-lg border border-border px-4 py-3"
            >
              {sponsor.website_url ? (
                <a
                  href={sponsor.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 hover:text-accent"
                >
                  {content}
                </a>
              ) : (
                <div className="flex items-center gap-3">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
