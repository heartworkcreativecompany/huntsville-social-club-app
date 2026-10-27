import Image from 'next/image'
import Link from 'next/link'

const cardClassName =
  'group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export default function EventImageCard({
  href,
  imageSrc,
  imageAlt = '',
  imageSizes,
  unoptimized = false,
  priority = false,
  aspectClassName = 'aspect-[16/10]',
  bodyClassName = 'space-y-2 p-5 sm:p-6',
  className = '',
  children,
}: {
  href?: string
  imageSrc: string
  imageAlt?: string
  imageSizes: string
  unoptimized?: boolean
  priority?: boolean
  aspectClassName?: string
  bodyClassName?: string
  className?: string
  children: React.ReactNode
}) {
  const content = (
    <>
      <div
        className={`relative w-full overflow-hidden bg-surface-elevated ${aspectClassName}`}
      >
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes={imageSizes}
          priority={priority}
          className={
            href
              ? 'object-cover transition duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100'
              : 'object-cover'
          }
          unoptimized={unoptimized}
        />
      </div>
      <div className={`min-w-0 break-words ${bodyClassName}`}>{children}</div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={`${cardClassName} ${className}`.trim()}>
        {content}
      </Link>
    )
  }

  return <div className={`${cardClassName} ${className}`.trim()}>{content}</div>
}
