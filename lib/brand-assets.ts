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

export const BRAND_LOGO_HEIGHT = {
  sm: { wordmark: 'h-8', circle: 'h-8 w-8' },
  md: { wordmark: 'h-10 sm:h-11', circle: 'h-10 w-10 sm:h-11 sm:w-11' },
  lg: { wordmark: 'h-14 sm:h-16', circle: 'h-20 w-20 sm:h-24 sm:w-24' },
} as const
