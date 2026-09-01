import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import AdminMemberManagementCard, {
  ADMIN_MEMBER_MANAGEMENT_CTA,
  ADMIN_MEMBER_MANAGEMENT_HEADING,
  ADMIN_MEMBER_MANAGEMENT_HREF,
} from '@/components/admin/admin-member-management-card'
import { MembersDashboardLayout } from '@/components/members/members-dashboard-layout'

const repoRoot = join(__dirname, '../..')

describe('Admin dashboard member management card', () => {
  it('renders Manage member profiles → with href /admin/users', () => {
    const html = renderToStaticMarkup(createElement(AdminMemberManagementCard))

    expect(html).toContain(ADMIN_MEMBER_MANAGEMENT_HEADING)
    expect(html).toContain(
      'Review member profiles, recognition badges, complimentary access, roles, and roster status.'
    )
    expect(html).toContain(ADMIN_MEMBER_MANAGEMENT_CTA)
    expect(html).toContain(`href="${ADMIN_MEMBER_MANAGEMENT_HREF}"`)
    expect(ADMIN_MEMBER_MANAGEMENT_HREF).toBe('/admin/users')
    expect(html).not.toContain('Manage users')
  })

  it('is omitted from the Members dashboard when the admin slot is empty', () => {
    const html = renderToStaticMarkup(
      createElement(MembersDashboardLayout, {
        heading: createElement('h1', null, 'Members'),
        directory: createElement('div', null, 'Member directory'),
      })
    )

    expect(html).not.toContain(ADMIN_MEMBER_MANAGEMENT_HEADING)
    expect(html).not.toContain(ADMIN_MEMBER_MANAGEMENT_CTA)
    expect(html).not.toContain('/admin/users')
  })

  it('mounts the card on the Members dashboard only for admins', () => {
    const membersPage = readFileSync(
      join(repoRoot, 'app/(club)/members/page.tsx'),
      'utf8'
    )

    expect(membersPage).toContain('AdminMemberManagementCard')
    expect(membersPage).toContain("viewer.role === 'admin' ? <AdminMemberManagementCard />")
    expect(membersPage).not.toContain('Manage users')
  })

  it('leaves existing admin routes and sidebar destinations unchanged', () => {
    const clubNav = readFileSync(
      join(repoRoot, 'lib/club-nav-items.ts'),
      'utf8'
    )
    expect(clubNav).toContain("href: '/admin/applications'")
    expect(clubNav).toContain("label: 'Admin'")
    expect(clubNav).toContain('const showAdmin = role === \'admin\'')

    const usersPage = readFileSync(
      join(repoRoot, 'app/(club)/admin/users/page.tsx'),
      'utf8'
    )
    expect(usersPage).toContain("viewer.role !== 'admin'")
    expect(usersPage).toContain('Operations access required')

    const memberDetailPage = readFileSync(
      join(repoRoot, 'app/(club)/admin/users/[id]/page.tsx'),
      'utf8'
    )
    expect(memberDetailPage).toContain("viewer.role !== 'admin'")
    expect(memberDetailPage).toContain('Operations access required')
    expect(memberDetailPage).toContain('href="/admin/users"')

    const applicationsPage = readFileSync(
      join(repoRoot, 'app/(club)/admin/applications/page.tsx'),
      'utf8'
    )
    expect(applicationsPage).toContain('href="/admin/curated-matches"')
    expect(applicationsPage).toContain('href="/admin/moderation-actions"')
    expect(applicationsPage).toContain('href="/admin/users"')
    expect(applicationsPage).not.toContain('Manage users')
  })
})
