import Link from 'next/link'
import { SUPPORT_EMAIL } from '@/lib/site'

export default function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`border-t border-border bg-surface px-5 py-8 text-sm text-muted-foreground sm:px-8 ${className}`}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Questions?{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-accent underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <nav className="flex flex-wrap gap-4">
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="underline hover:text-foreground">
            Terms
          </Link>
          <Link href="/code-of-conduct" className="underline hover:text-foreground">
            Code of Conduct
          </Link>
        </nav>
      </div>
    </footer>
  )
}
