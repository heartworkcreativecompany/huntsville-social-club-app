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
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:px-8 sm:py-5">
          <BrandLogo href="/" variant="wordmark" size="lg" />
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-3xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
        <h1 className="text-display text-2xl font-medium break-words text-foreground sm:text-3xl">
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
