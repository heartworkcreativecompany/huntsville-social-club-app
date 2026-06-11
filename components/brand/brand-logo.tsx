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
  /** Dark canvas default — light-ink official logos. */
  surface?: BrandSurfaceTheme
  priority?: boolean
}

export default function BrandLogo({
  variant = 'wordmark',
  size = 'md',
  href,
  className = '',
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
        className="inline-flex shrink-0 rounded-md transition hover:opacity-90"
      >
        {image}
      </Link>
    )
  }

  return <span className="inline-flex shrink-0">{image}</span>
}
