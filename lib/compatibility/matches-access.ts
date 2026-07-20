import type { CompatibilityStatusSummary } from '@/lib/compatibility/profile-status'

/** Matches inbox is only available when curated matching is fully active for the member. */
export function canAccessMatchesInbox(
  summary: Pick<CompatibilityStatusSummary, 'status'>
): boolean {
  return summary.status === 'active'
}
