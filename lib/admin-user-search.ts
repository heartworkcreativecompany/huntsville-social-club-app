import { resolveApplicationStatus } from '@/lib/application'

export function normalizeAdminUserSearch(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return ''
  return raw.trim()
}

/**
 * PostgREST `or` filter matching the name and email shown on User Management.
 * The pattern is quoted so commas in a name do not split the filter.
 */
export function adminUserSearchOrFilter(search: string): string {
  const escaped = normalizeAdminUserSearch(search)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
  const pattern = `"%${escaped}%"`
  return `full_name.ilike.${pattern},email.ilike.${pattern}`
}

export function countPendingApplications(
  rows: readonly {
    application_status?: string | null
    role?: string | null
  }[]
): number {
  return rows.filter(
    (row) => resolveApplicationStatus(row) !== 'approved'
  ).length
}
