'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/login/actions'
import { roleLabel } from '@/lib/event-labels'
import type { ApplicationStatus } from '@/lib/application'

type NavItem = {
  href: string
  label: string
  match?: (path: string) => boolean
}

function navLinkClass(active: boolean): string {
  return `rounded-lg px-3 py-2 text-sm font-medium transition ${
    active
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-accent-soft hover:text-foreground'
  }`
}

export default function ClubNav({
  role,
  canAccessApp,
  applicationStatus,
}: {
  role: string
  canAccessApp: boolean
  applicationStatus: ApplicationStatus
}) {
  const pathname = usePathname()
  const showAdmin = role === 'admin'
  const showApplicationNav =
    !canAccessApp || applicationStatus === 'needs_info'

  const items: NavItem[] = [
    {
      href: '/home',
      label: 'Home',
      match: (p) => p === '/home',
    },
  ]

  if (showApplicationNav) {
    items.push(
      {
        href: '/application',
        label: 'Application',
        match: (p) => p === '/application',
      },
      {
        href: '/application/status',
        label: 'Status',
        match: (p) => p === '/application/status',
      }
    )
  }

  if (canAccessApp) {
    items.push(
      {
        href: '/events',
        label: 'Events',
        match: (p) => p === '/events' || p.startsWith('/events/'),
      },
      {
        href: '/members',
        label: 'Members',
        match: (p) => p === '/members' || p.startsWith('/members/'),
      }
    )
  }

  if (showAdmin) {
    items.push({
      href: '/admin/applications',
      label: 'Admin',
      match: (p) => p.startsWith('/admin'),
    })
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex flex-wrap items-center gap-6">
          <Link
            href="/home"
            className="text-display text-lg font-medium text-foreground"
          >
            Huntsville Social Club
          </Link>
          <nav className="flex flex-wrap gap-1">
            {items.map((item) => {
              const active = item.match
                ? item.match(pathname)
                : pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(active)}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{roleLabel(role)}</span>
          <form action={signOut}>
            <button type="submit" className={navLinkClass(false)}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
