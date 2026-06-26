import Link from 'next/link'
import BrandLogo from '@/components/brand/brand-logo'
import { SUPPORT_EMAIL } from '@/lib/site'

export default function SiteFooter({
  className = '',
  variant = 'minimal',
}: {
  className?: string
  variant?: 'minimal' | 'marketing'
}) {
  if (variant === 'marketing') {
    return (
      <footer
        className={`mt-24 border-t border-white/10 bg-background text-muted-foreground ${className}`}
      >
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-3 md:px-10">
          <div>
            <BrandLogo href="/" variant="circle" size="footer" />
            <p className="mt-4 max-w-xs text-sm text-muted">
              Mingle mixers, speed dating, and curated socials for people who want
              to meet in real life in Rocket City.
            </p>
          </div>

          <div className="text-sm">
            <h4 className="font-brand mb-3 text-xs tracking-[0.2em] text-accent uppercase">
              The Club
            </h4>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <Link href="/signup" className="link-brand hover:text-foreground">
                  Join
                </Link>
              </li>
              <li>
                <Link
                  href="/code-of-conduct"
                  className="link-brand hover:text-foreground"
                >
                  Code of conduct
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="link-brand hover:text-foreground">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="link-brand hover:text-foreground">
                  Terms
                </Link>
              </li>
            </ul>
          </div>

          <div className="text-sm">
            <h4 className="font-brand mb-3 text-xs tracking-[0.2em] text-accent uppercase">
              Visit
            </h4>
            <p className="text-muted-foreground">Huntsville, AL</p>
            <p className="mt-2">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="link-brand hover:text-foreground"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>

        <div className="border-t border-white/10 py-4 text-center text-xs text-muted">
          © {new Date().getFullYear()} Huntsville Social Club · By invitation
          &amp; application
        </div>
      </footer>
    )
  }

  return (
    <footer
      className={`border-t border-border bg-surface px-5 py-8 text-sm text-muted-foreground sm:px-8 ${className}`}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <BrandLogo variant="wordmark" size="sm" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Questions?{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="link-brand font-medium underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <nav className="flex flex-wrap gap-4">
            <Link href="/privacy" className="link-brand underline hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="link-brand underline hover:text-foreground">
              Terms
            </Link>
            <Link
              href="/code-of-conduct"
              className="link-brand underline hover:text-foreground"
            >
              Code of Conduct
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
