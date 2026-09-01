export type ClubNavItem = {
  href: string
  label: string
  isActive: (pathname: string) => boolean
}

export function buildClubNavItems({
  role,
  canAccessApp,
  applicationStatus,
  showMatchesNav,
  showFriendsNav = false,
}: {
  role: string
  canAccessApp: boolean
  applicationStatus: string
  showMatchesNav: boolean
  showFriendsNav?: boolean
}): ClubNavItem[] {
  const showAdmin = role === 'admin'
  const showApplicationNav =
    !canAccessApp || applicationStatus === 'needs_info'

  const items: ClubNavItem[] = []

  if (showApplicationNav) {
    items.push(
      {
        href: '/application',
        label: 'Application',
        isActive: (pathname) => pathname === '/application',
      },
      {
        href: '/application/status',
        label: 'Status',
        isActive: (pathname) => pathname === '/application/status',
      }
    )
  }

  if (canAccessApp) {
    items.push(
      {
        href: '/dashboard',
        label: 'Dashboard',
        isActive: (pathname) =>
          pathname === '/dashboard' || pathname.startsWith('/dashboard/'),
      },
      {
        href: '/members',
        label: 'Members',
        isActive: (pathname) =>
          pathname === '/members' ||
          (pathname.startsWith('/members/') && !pathname.startsWith('/profile')),
      },
      {
        href: '/events',
        label: 'Events',
        isActive: (pathname) =>
          pathname === '/events' || pathname.startsWith('/events/'),
      },
      {
        href: '/business',
        label: 'Business Directory',
        isActive: (pathname) =>
          pathname === '/business' || pathname.startsWith('/business/'),
      },
      {
        href: '/messages',
        label: 'Messages',
        isActive: (pathname) =>
          pathname === '/messages' || pathname.startsWith('/messages/'),
      }
    )

    if (showMatchesNav) {
      items.push({
        href: '/matches',
        label: 'Matches',
        isActive: (pathname) => pathname === '/matches',
      })
    }

    if (showFriendsNav) {
      items.push({
        href: '/friendship/matches',
        label: 'Friends',
        isActive: (pathname) =>
          pathname === '/friendship' || pathname.startsWith('/friendship/'),
      })
    }

    items.push({
      href: '/profile',
      label: 'Your Profile',
      isActive: (pathname) => pathname === '/profile',
    })
  }

  if (showAdmin) {
    items.push({
      href: '/admin/applications',
      label: 'Admin',
      isActive: (pathname) => pathname.startsWith('/admin'),
    })
  }

  return items
}

export function clubLogoHref(canAccessApp: boolean): string {
  return canAccessApp ? '/dashboard' : '/application'
}
