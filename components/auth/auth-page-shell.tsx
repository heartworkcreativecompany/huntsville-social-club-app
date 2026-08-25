import Link from 'next/link'
import BrandLogo from '@/components/brand/brand-logo'
import SiteFooter from '@/components/shell/site-footer'

export default function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow?: string
  title: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="border-b border-border bg-surface shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:px-8 sm:py-5">
          <BrandLogo href="/" variant="wordmark" size="lg" />
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-md flex-1 px-5 py-8 sm:px-8 sm:py-16">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-display mt-2 text-2xl font-semibold break-words sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-8">{children}</div>

        {footer ? <div className="mt-8">{footer}</div> : null}

        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/" className="link-brand font-medium underline">
            ← Back to public home
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  )
}
