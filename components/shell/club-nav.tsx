'use client'

import { useEffect, useRef, useState, type Ref } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/login/actions'
import BrandLogo from '@/components/brand/brand-logo'
import NotificationsBell from '@/components/shell/notifications-bell'
import { navLinkClassName } from '@/components/shell/nav-link-class'
import {
  CLUB_MOBILE_NAV_ID,
  CLUB_MOBILE_NAV_MEDIA_QUERY,
  isMobileNavEscapeKey,
  isOutsideMobileNav,
  mobileNavToggleLabel,
} from '@/lib/club-mobile-nav'
import {
  buildClubNavItems,
  clubLogoHref,
  type ClubNavItem,
} from '@/lib/club-nav-items'
import type { ApplicationStatus } from '@/lib/application'
import type { MemberNotificationItem } from '@/lib/load-member-notifications'

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className="h-6 w-6"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  )
}

const mobileLinkClassName = (active: boolean) =>
  `${navLinkClassName(active)} flex min-h-11 w-full items-center px-4`

export function ClubNavMarkup({
  items,
  logoHref,
  pathname,
  mobileOpen,
  notifications,
  unreadNotificationCount,
  onToggleMobileNav,
  onCloseMobileNav,
  headerRef,
  toggleRef,
}: {
  items: ClubNavItem[]
  logoHref: string
  pathname: string
  mobileOpen: boolean
  notifications: MemberNotificationItem[]
  unreadNotificationCount: number
  onToggleMobileNav: () => void
  onCloseMobileNav: () => void
  headerRef?: Ref<HTMLElement>
  toggleRef?: Ref<HTMLButtonElement>
}) {
  return (
    <header
      ref={headerRef}
      className="relative z-50 border-b border-border bg-surface shadow-sm"
    >
      <div
        data-club-header="mobile"
        className="mx-auto grid max-w-6xl grid-cols-[44px_minmax(0,1fr)_44px] items-center px-5 py-4 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] lg:hidden"
      >
        <div className="flex h-11 w-11 items-center justify-center justify-self-start overflow-visible">
          <NotificationsBell
            items={notifications}
            unreadCount={unreadNotificationCount}
            buttonClassName="relative inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-accent transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          />
        </div>
        <div className="flex min-w-0 justify-center">
          <BrandLogo href={logoHref} variant="wordmark" size="md" />
        </div>
        <button
          ref={toggleRef}
          type="button"
          className="inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center justify-self-end rounded-full text-accent transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          aria-label={mobileNavToggleLabel(mobileOpen)}
          aria-expanded={mobileOpen}
          aria-controls={CLUB_MOBILE_NAV_ID}
          onClick={onToggleMobileNav}
        >
          <MenuIcon open={mobileOpen} />
        </button>
      </div>

      <div
        data-club-header="desktop"
        className="mx-auto hidden max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:flex"
      >
        <div className="flex min-w-0 items-center gap-6">
          <BrandLogo href={logoHref} variant="wordmark" size="md" />
          <nav className="flex flex-wrap gap-1" aria-label="Club">
            {items.map((item) => (
              <Link
                key={`desktop-${item.href}`}
                href={item.href}
                className={navLinkClassName(item.isActive(pathname))}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1">
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

      <nav
        id={CLUB_MOBILE_NAV_ID}
        className="absolute inset-x-0 top-full border-b border-border bg-surface shadow-md lg:hidden"
        aria-label="Club"
        hidden={!mobileOpen}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
          {items.map((item) => (
            <Link
              key={`mobile-${item.href}`}
              href={item.href}
              className={mobileLinkClassName(item.isActive(pathname))}
              onClick={onCloseMobileNav}
            >
              {item.label}
            </Link>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              className={mobileLinkClassName(false)}
              onClick={onCloseMobileNav}
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </header>
  )
}

export default function ClubNav({
  role,
  canAccessApp,
  applicationStatus,
  showMatchesNav,
  showFriendsNav = false,
  notifications,
  unreadNotificationCount,
}: {
  role: string
  canAccessApp: boolean
  applicationStatus: ApplicationStatus
  showMatchesNav: boolean
  showFriendsNav?: boolean
  notifications: MemberNotificationItem[]
  unreadNotificationCount: number
}) {
  const pathname = usePathname()

  return (
    <ClubNavController
      key={pathname}
      pathname={pathname}
      role={role}
      canAccessApp={canAccessApp}
      applicationStatus={applicationStatus}
      showMatchesNav={showMatchesNav}
      showFriendsNav={showFriendsNav}
      notifications={notifications}
      unreadNotificationCount={unreadNotificationCount}
    />
  )
}

function ClubNavController({
  pathname,
  role,
  canAccessApp,
  applicationStatus,
  showMatchesNav,
  showFriendsNav = false,
  notifications,
  unreadNotificationCount,
}: {
  pathname: string
  role: string
  canAccessApp: boolean
  applicationStatus: ApplicationStatus
  showMatchesNav: boolean
  showFriendsNav?: boolean
  notifications: MemberNotificationItem[]
  unreadNotificationCount: number
}) {
  const headerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  const items = buildClubNavItems({
    role,
    canAccessApp,
    applicationStatus,
    showMatchesNav,
    showFriendsNav,
  })

  useEffect(() => {
    if (!mobileOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (isMobileNavEscapeKey(event.key)) {
        event.preventDefault()
        setMobileOpen(false)
        toggleRef.current?.focus()
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (isOutsideMobileNav(event.target, headerRef.current)) {
        setMobileOpen(false)
        toggleRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [mobileOpen])

  useEffect(() => {
    const media = window.matchMedia(CLUB_MOBILE_NAV_MEDIA_QUERY)
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setMobileOpen(false)
      }
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  return (
    <ClubNavMarkup
      items={items}
      logoHref={clubLogoHref(canAccessApp)}
      pathname={pathname}
      mobileOpen={mobileOpen}
      notifications={notifications}
      unreadNotificationCount={unreadNotificationCount}
      onToggleMobileNav={() => setMobileOpen((open) => !open)}
      onCloseMobileNav={() => setMobileOpen(false)}
      headerRef={headerRef}
      toggleRef={toggleRef}
    />
  )
}
