import Image from 'next/image'
import { marketingButtonPrimaryClassName } from '@/lib/event-labels'
import {
  HOMEPAGE_INSTAGRAM_BODY,
  HOMEPAGE_INSTAGRAM_CTA,
  HOMEPAGE_INSTAGRAM_EYEBROW,
  HOMEPAGE_INSTAGRAM_HANDLE,
  HOMEPAGE_INSTAGRAM_HEADING,
  HOMEPAGE_INSTAGRAM_OVERLAY_LABEL,
  HOMEPAGE_INSTAGRAM_POST_SLOTS,
  HOMEPAGE_INSTAGRAM_UNCONFIGURED_LABEL,
  HSC_INSTAGRAM_PROFILE_URL,
  homepageInstagramLinkLabel,
  isConfiguredInstagramPost,
  type HomepageInstagramTile,
} from '@/lib/homepage-instagram-community'

const tileFrameClassName =
  'relative block aspect-[4/5] overflow-hidden border border-border bg-surface'

const tileLinkClassName =
  'group relative block min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const tileMotionClassName =
  'object-cover transition duration-500 group-hover:scale-[1.03] group-focus-visible:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100'

const overlayClassName =
  'pointer-events-none absolute inset-0 flex items-end bg-black/45 p-3 opacity-0 transition duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none'

export default function HomepageInstagramCommunity({
  tiles = HOMEPAGE_INSTAGRAM_POST_SLOTS,
}: {
  tiles?: readonly HomepageInstagramTile[]
}) {
  return (
    <section
      aria-labelledby="instagram-community-heading"
      className="border-t border-white/10 bg-background text-foreground"
    >
      <div className="mx-auto max-w-6xl px-5 py-16 text-center sm:px-6 sm:py-20 md:px-10">
        <p className="hero-eyebrow">
          <span className="hero-eyebrow-line" aria-hidden />
          {HOMEPAGE_INSTAGRAM_EYEBROW}
        </p>
        <h2
          id="instagram-community-heading"
          className="font-brand mx-auto mt-5 max-w-3xl text-3xl font-semibold text-balance sm:text-4xl"
        >
          {HOMEPAGE_INSTAGRAM_HEADING}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {HOMEPAGE_INSTAGRAM_BODY}
        </p>

        <ul className="mt-12 grid grid-cols-2 gap-3 text-left md:grid-cols-3 md:gap-4 lg:grid-cols-5">
          {tiles.map((tile, index) => {
            const configured = isConfiguredInstagramPost(tile)
            return (
              <li key={`${tile.href || 'slot'}-${index}`}>
                {configured ? (
                  <a
                    href={tile.href.trim()}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={homepageInstagramLinkLabel(tile.alt)}
                    className={tileLinkClassName}
                  >
                    <span className={tileFrameClassName}>
                      <Image
                        src={tile.image.trim()}
                        alt={tile.alt.trim()}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className={tileMotionClassName}
                      />
                      <span className={overlayClassName} aria-hidden>
                        <span className="text-xs font-medium tracking-wide text-white uppercase">
                          {HOMEPAGE_INSTAGRAM_OVERLAY_LABEL}
                        </span>
                      </span>
                    </span>
                  </a>
                ) : (
                  <div className={`${tileFrameClassName} flex items-end p-3`}>
                    <p className="text-sm leading-snug text-muted-foreground">
                      {HOMEPAGE_INSTAGRAM_UNCONFIGURED_LABEL}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">{HOMEPAGE_INSTAGRAM_HANDLE}</p>
          <a
            href={HSC_INSTAGRAM_PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            className={marketingButtonPrimaryClassName}
          >
            {HOMEPAGE_INSTAGRAM_CTA}
          </a>
        </div>
      </div>
    </section>
  )
}
