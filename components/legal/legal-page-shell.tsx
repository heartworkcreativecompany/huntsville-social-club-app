import Link from 'next/link'
import BrandLogo from '@/components/brand/brand-logo'
import SiteFooter from '@/components/shell/site-footer'

export default function LegalPageShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="border-b border-border bg-surface shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
          <BrandLogo href="/" variant="wordmark" size="lg" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
        <h1 className="text-display text-3xl font-medium text-foreground">
          {title}
        </h1>
        <div className="prose-policy mt-8 grid gap-4 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
        <p className="mt-10">
          <Link href="/" className="link-brand font-medium underline">
            ← Back to home
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  )
}
