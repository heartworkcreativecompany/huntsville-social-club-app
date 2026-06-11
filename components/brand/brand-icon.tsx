import { BRAND_ALT, BRAND_ASSETS } from '@/lib/brand-assets'

export type BrandIconName =
  | 'star-red'
  | 'star-gold'
  | 'cocktail-gold'
  | 'balloon-gold'
  | 'celebrate-gold'
  | 'lookingglass-heart-gold'

const ICON_SRC: Record<BrandIconName, string> = {
  'star-red': BRAND_ASSETS.star.red,
  'star-gold': BRAND_ASSETS.star.gold,
  'cocktail-gold': BRAND_ASSETS.cocktail.gold,
  'balloon-gold': BRAND_ASSETS.accent.balloonGold,
  'celebrate-gold': BRAND_ASSETS.accent.celebrateGold,
  'lookingglass-heart-gold': BRAND_ASSETS.accent.lookingglassHeartGold,
}

const ICON_ALT: Record<BrandIconName, string> = {
  'star-red': `${BRAND_ALT} star`,
  'star-gold': `${BRAND_ALT} star`,
  'cocktail-gold': `${BRAND_ALT} cocktail mark`,
  'balloon-gold': `${BRAND_ALT} balloon mark`,
  'celebrate-gold': `${BRAND_ALT} celebrate mark`,
  'lookingglass-heart-gold': `${BRAND_ALT} looking glass mark`,
}

/** Decorative brand accent icons from the kit — use sparingly. */
export default function BrandIcon({
  name,
  className = 'h-5 w-5',
  decorative = true,
}: {
  name: BrandIconName
  className?: string
  /** When true, hidden from assistive tech (decorative only). */
  decorative?: boolean
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- official SVG brand assets
    <img
      src={ICON_SRC[name]}
      alt={decorative ? '' : ICON_ALT[name]}
      aria-hidden={decorative ? true : undefined}
      className={`object-contain ${className}`}
      decoding="async"
    />
  )
}
