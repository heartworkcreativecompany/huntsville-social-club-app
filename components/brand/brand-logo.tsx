import Link from 'next/link'
import BrandImage from '@/components/brand/brand-image'
import {
  BRAND_LOGO_HEIGHT,
  type BrandLogoVariant,
  type BrandSurfaceTheme,
} from '@/lib/brand-assets'

type BrandLogoProps = {
  variant?: BrandLogoVariant
  size?: keyof typeof BRAND_LOGO_HEIGHT
  href?: string
  className?: string
  frameClassName?: string
  /** Dark canvas default — light-ink official logos. */
  surface?: BrandSurfaceTheme
  priority?: boolean
}

export default function BrandLogo({
  variant = 'wordmark',
  size = 'md',
  href,
  className = '',
  frameClassName = '',
  surface = 'dark',
  priority = false,
}: BrandLogoProps) {
  const sizeClassName = BRAND_LOGO_HEIGHT[size][variant]

  const image = (
    <BrandImage
      variant={variant}
      surface={surface}
      sizeClassName={sizeClassName}
      className={className}
      priority={priority}
    />
  )

  if (href) {
    return (
      <Link
        href={href}
        className={`inline-flex shrink-0 rounded-md transition hover:opacity-90 ${frameClassName}`.trim()}
      >
        {image}
      </Link>
    )
  }

  return (
    <span className={`inline-flex shrink-0 ${frameClassName}`.trim()}>{image}</span>
  )
}
