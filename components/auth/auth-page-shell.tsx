import Link from 'next/link'
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
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link
            href="/"
            className="text-display text-xl font-medium text-foreground"
          >
            Huntsville Social Club
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-display mt-2 text-3xl font-medium text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-8">{children}</div>

        {footer ? <div className="mt-8">{footer}</div> : null}

        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/" className="font-medium text-accent underline">
            ← Back to public home
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  )
}
