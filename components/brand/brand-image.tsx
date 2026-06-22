import {
  BRAND_ALT,
  brandAssetPair,
  type BrandLogoVariant,
  type BrandSurfaceTheme,
} from '@/lib/brand-assets'

type BrandImageProps = {
  variant: BrandLogoVariant
  /** App default is dark — uses light-ink logo assets. */
  surface?: BrandSurfaceTheme
  className?: string
  sizeClassName?: string
  priority?: boolean
}

/**
 * Renders official kit SVGs. Default surface is dark (light-ink logos).
 */
export default function BrandImage({
  variant,
  surface = 'dark',
  className = '',
  sizeClassName = '',
  priority = false,
}: BrandImageProps) {
  const { forLightBackground, forDarkBackground } = brandAssetPair(
    variant,
    surface
  )

  const src =
    surface === 'light' ? forLightBackground : forDarkBackground

  const dimensionClass =
    sizeClassName ||
    (variant === 'circle'
      ? 'h-14 w-14'
      : 'h-auto w-[140px] max-w-[min(100%,280px)]')

  const imgClass = `${dimensionClass} object-contain ${className}`.trim()

  return (
    // eslint-disable-next-line @next/next/no-img-element -- official SVG brand assets
    <img
      src={src}
      alt={BRAND_ALT}
      className={imgClass}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
    />
  )
}
