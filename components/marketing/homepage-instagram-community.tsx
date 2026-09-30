import Image from 'next/image'
import {
  HOMEPAGE_INSTAGRAM_BODY,
  HOMEPAGE_INSTAGRAM_CTA,
  HOMEPAGE_INSTAGRAM_EYEBROW,
  HOMEPAGE_INSTAGRAM_HANDLE,
  HOMEPAGE_INSTAGRAM_HEADING,
  HOMEPAGE_INSTAGRAM_OVERLAY_LABEL,
  HOMEPAGE_INSTAGRAM_TILES,
  HSC_INSTAGRAM_PROFILE_URL,
  homepageInstagramLinkLabel,
  type HomepageInstagramTile,
} from '@/lib/homepage-instagram-community'

const tileLinkClassName =
  'group relative block min-h-11 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b4f2a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4efe6]'

const tileMotionClassName =
  'object-cover transition duration-500 group-hover:scale-[1.03] group-focus-visible:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100'

const overlayClassName =
  'pointer-events-none absolute inset-0 flex items-end bg-black/0 p-3 opacity-0 transition duration-500 group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100 motion-reduce:transition-none'

export default function HomepageInstagramCommunity({
  tiles = HOMEPAGE_INSTAGRAM_TILES,
}: {
  tiles?: readonly HomepageInstagramTile[]
}) {
  const visibleTiles = tiles.filter((tile) => tile.alt.trim() && tile.href.trim())

  return (
    <section
      aria-labelledby="instagram-community-heading"
      className="bg-[#f4efe6] text-[#1d1f1d]"
    >
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-[40rem] text-center">
          <p className="inline-flex items-center gap-3 text-[0.6875rem] font-medium tracking-[0.28em] text-[#6b4f2a] uppercase">
            <span className="h-px w-8 bg-[#6b4f2a]" aria-hidden />
            {HOMEPAGE_INSTAGRAM_EYEBROW}
            <span className="h-px w-8 bg-[#6b4f2a]" aria-hidden />
          </p>
          <h2
            id="instagram-community-heading"
            className="font-brand mt-5 text-3xl font-semibold text-balance sm:text-4xl"
          >
            {HOMEPAGE_INSTAGRAM_HEADING}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#3f463f] sm:text-lg">
            {HOMEPAGE_INSTAGRAM_BODY}
          </p>
        </div>

        {visibleTiles.length > 0 ? (
          <ul className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
            {visibleTiles.map((tile) => (
              <li key={`${tile.image}-${tile.alt}`}>
                <a
                  href={tile.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={homepageInstagramLinkLabel(tile.alt)}
                  className={tileLinkClassName}
                >
                  <span className="relative block aspect-[4/5] overflow-hidden bg-[#e7e0d4]">
                    {tile.image.trim() ? (
                      <Image
                        src={tile.image}
                        alt={tile.alt}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className={tileMotionClassName}
                      />
                    ) : (
                      <span className="flex h-full items-end p-3 text-left text-sm leading-snug text-[#3f463f]">
                        {tile.alt}
                      </span>
                    )}
                    <span className={overlayClassName} aria-hidden>
                      <span className="text-xs font-medium tracking-wide text-white uppercase">
                        {HOMEPAGE_INSTAGRAM_OVERLAY_LABEL}
                      </span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-sm tracking-wide text-[#3f463f]">
            {HOMEPAGE_INSTAGRAM_HANDLE}
          </p>
          <a
            href={HSC_INSTAGRAM_PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 py-3 text-sm font-medium tracking-wide text-accent-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b4f2a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4efe6] sm:px-6"
          >
            {HOMEPAGE_INSTAGRAM_CTA}
          </a>
        </div>
      </div>
    </section>
  )
}
