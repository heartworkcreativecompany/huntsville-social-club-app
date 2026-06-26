/**
 * Official Huntsville Social Club brand kit assets (public/brand/).
 *
 * Naming convention from the kit:
 * - *-dark.svg  → dark ink, for light/cream backgrounds
 * - *-light.svg → light ink, for dark/black backgrounds
 */

export const BRAND_ALT = 'Huntsville Social Club'

export const BRAND_ASSETS = {
  wordmark: {
    forLightBackground: '/brand/hsc-wordmark-dark.svg',
    forDarkBackground: '/brand/hsc-wordmark-light.svg',
  },
  circle: {
    forLightBackground: '/brand/hsc-circle-dark.svg',
    forDarkBackground: '/brand/hsc-circle-light.svg',
  },
  star: {
    red: '/brand/hsc-star-red.svg',
    gold: '/brand/hsc-star-gold.svg',
  },
  cocktail: {
    gold: '/brand/hsc-cocktail-gold.svg',
  },
  accent: {
    balloonGold: '/brand/hsc-balloon-gold.svg',
    celebrateGold: '/brand/hsc-celebrate-gold.svg',
    lookingglassHeartGold: '/brand/hsc-lookingglass-heart-gold.svg',
  },
} as const

export type BrandLogoVariant = 'wordmark' | 'circle'

/** Explicit surface theme — app default is dark (light-ink logos). */
export type BrandSurfaceTheme = 'auto' | 'light' | 'dark'

export function brandAssetPair(
  variant: BrandLogoVariant,
  surface: BrandSurfaceTheme = 'auto'
): { forLightBackground: string; forDarkBackground: string } {
  const assets = BRAND_ASSETS[variant]
  if (surface === 'light') {
    return {
      forLightBackground: assets.forLightBackground,
      forDarkBackground: assets.forLightBackground,
    }
  }
  if (surface === 'dark') {
    return {
      forLightBackground: assets.forDarkBackground,
      forDarkBackground: assets.forDarkBackground,
    }
  }
  return assets
}

/**
 * Responsive logo dimensions (official SVGs, width-led for wordmarks).
 *
 * sm     — compact footer wordmark
 * md     — in-app header beside navigation
 * lg     — auth headers, feature sections
 * xl     — marketing hero header wordmark (Lovable scale)
 * footer — marketing footer circle mark
 */
export const BRAND_LOGO_HEIGHT = {
  sm: {
    wordmark: 'h-auto w-[100px] sm:w-[112px]',
    circle: 'h-10 w-10 sm:h-11 sm:w-11',
  },
  md: {
    wordmark: 'h-auto w-[120px] sm:w-[132px]',
    circle: 'h-14 w-14 sm:h-16 sm:w-16',
  },
  lg: {
    wordmark: 'h-auto w-[140px] sm:w-[156px] md:w-[172px]',
    circle: 'h-[72px] w-[72px] sm:h-[88px] sm:w-[88px] md:h-[104px] md:w-[104px]',
  },
  xl: {
    wordmark: 'h-12 w-auto sm:h-20 md:h-[6.5rem]',
    circle: 'h-[72px] w-[72px] sm:h-[88px] sm:w-[88px] md:h-[104px] md:w-[104px]',
  },
  footer: {
    wordmark: 'h-auto w-[112px]',
    circle: 'h-24 w-24',
  },
} as const
