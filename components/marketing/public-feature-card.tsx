import BrandIcon, { type BrandIconName } from '@/components/brand/brand-icon'

export default function PublicFeatureCard({
  icon,
  title,
  description,
}: {
  icon: BrandIconName
  title: string
  description: string
}) {
  return (
    <li className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <BrandIcon name={icon} className="h-10 w-10" decorative />
      <h2 className="text-display mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </li>
  )
}
