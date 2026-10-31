import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  adminUserSearchOrFilter,
  countPendingApplications,
  normalizeAdminUserSearch,
} from '@/lib/admin-user-search'

const repoRoot = join(__dirname, '..')

describe('admin user search', () => {
  it('matches a trimmed name or email without changing the queue count', () => {
    expect(normalizeAdminUserSearch('  Ann@Club.test  ')).toBe('Ann@Club.test')
    expect(adminUserSearchOrFilter('  Ann, Jr. ')).toBe(
      'full_name.ilike."%Ann, Jr.%"' + ',email.ilike."%Ann, Jr.%"'
    )
    expect(adminUserSearchOrFilter('Ann_Marie%')).toBe(
      'full_name.ilike."%Ann\\_Marie\\%%",email.ilike."%Ann\\_Marie\\%%"'
    )
    expect(adminUserSearchOrFilter('Ann')).not.toContain('membership_intent')

    const statuses = [
      { application_status: 'approved', role: 'member' },
      { application_status: 'submitted', role: 'member' },
      { application_status: null, role: 'admin' },
      { application_status: 'needs_info', role: 'host' },
    ]
    expect(countPendingApplications(statuses)).toBe(2)
    expect(
      countPendingApplications(
        statuses.filter((row) => row.application_status === 'submitted')
      )
    ).not.toBe(countPendingApplications(statuses))
  })

  it('keeps admin authorization, the self-role lock, and the full queue count', () => {
    const source = readFileSync(
      join(repoRoot, 'app/(club)/admin/users/page.tsx'),
      'utf8'
    )
    const authCheck = source.indexOf("viewer.role !== 'admin'")
    const profileQuery = source.indexOf(".from('profiles')")
    expect(authCheck).toBeGreaterThan(-1)
    expect(profileQuery).toBeGreaterThan(authCheck)
    expect(source).toContain('AdminUserSearch')
    const searchUi = readFileSync(
      join(repoRoot, 'components/admin/admin-user-search.tsx'),
      'utf8'
    )
    expect(searchUi).toContain('Search users')
    expect(searchUi).toContain('Name or email')
    expect(source).toContain('requireAdminClient')
    expect(source).toContain('Current account — role changes disabled')
    expect(source).toContain('countPendingApplications(statusRows ?? [])')
    expect(source).toContain('loadAdminStatusRows')
    expect(source).not.toContain('MEMBER_DIRECTORY_PAGE_SIZE')
    expect(source.indexOf('adminUserSearchOrFilter(search)')).toBeGreaterThan(
      source.indexOf('loadAdminUserRows')
    )
    const statusLoader = source.slice(source.indexOf('async function loadAdminStatusRows'))
    expect(statusLoader).not.toContain('ilike')
  })
})
