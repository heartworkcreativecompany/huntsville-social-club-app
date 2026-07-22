'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/login/actions'
import BrandLogo from '@/components/brand/brand-logo'
import NotificationsBell from '@/components/shell/notifications-bell'
import { navLinkClassName } from '@/components/shell/nav-link-class'
import type { ApplicationStatus } from '@/lib/application'
import type { MemberNotificationItem } from '@/lib/load-member-notifications'

type NavItem = {
  href: string
  label: string
  match?: (path: string) => boolean
}

export default function ClubNav({
  role,
  canAccessApp,
  applicationStatus,
  showMatchesNav,
  notifications,
  unreadNotificationCount,
}: {
  role: string
  canAccessApp: boolean
  applicationStatus: ApplicationStatus
  showMatchesNav: boolean
  notifications: MemberNotificationItem[]
  unreadNotificationCount: number
}) {
  const pathname = usePathname()
  const showAdmin = role === 'admin'
  const showApplicationNav =
    !canAccessApp || applicationStatus === 'needs_info'

  const items: NavItem[] = []

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
        href: '/members',
        label: 'Members',
        match: (p) =>
          p === '/members' ||
          (p.startsWith('/members/') && !p.startsWith('/profile')),
      },
      {
        href: '/events',
        label: 'Events',
        match: (p) => p === '/events' || p.startsWith('/events/'),
      },
      {
        href: '/business',
        label: 'Business',
        match: (p) => p === '/business' || p.startsWith('/business/'),
      },
      {
        href: '/messages',
        label: 'Messages',
        match: (p) => p === '/messages' || p.startsWith('/messages/'),
      },
      ...(showMatchesNav
        ? [
            {
              href: '/matches',
              label: 'Matches',
              match: (p: string) => p === '/matches',
            },
          ]
        : []),
      {
        href: '/profile',
        label: 'Your Profile',
        match: (p) => p === '/profile',
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

  const logoHref = canAccessApp ? '/members' : '/application'

  return (
    <header className="border-b border-border bg-surface shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex flex-wrap items-center gap-6">
          <BrandLogo href={logoHref} variant="wordmark" size="md" />
          <nav className="flex flex-wrap gap-1">
            {items.map((item) => {
              const active = item.match
                ? item.match(pathname)
                : pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClassName(active)}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationsBell
            items={notifications}
            unreadCount={unreadNotificationCount}
          />
          <form action={signOut}>
            <button type="submit" className={navLinkClassName(false)}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
