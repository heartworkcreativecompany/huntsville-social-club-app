import { normalizeBusinessWebsiteUrl } from '@/lib/business-listing-website'

const defaultClassName =
  'font-brand text-sm font-medium text-accent break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export default function BusinessWebsiteLink({
  businessName,
  websiteUrl,
  className = defaultClassName,
}: {
  businessName: string
  websiteUrl: string | null | undefined
  className?: string
}) {
  const websiteHref = normalizeBusinessWebsiteUrl(websiteUrl)
  if (!websiteHref) return null

  return (
    <a
      href={websiteHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visit ${businessName} website`}
      className={className}
    >
      Visit website ↗
    </a>
  )
}
