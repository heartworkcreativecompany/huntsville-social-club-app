import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureOperationalError } from '@/lib/capture-error'
import {
  authDisplayNameMetadata,
  emptyAuthDisplayNameBackfillCounts,
  normalizePublicFacingName,
  recordAuthDisplayNameBackfillResult,
  shouldSyncAuthDisplayName,
  type AuthDisplayNameBackfillCounts,
} from '@/lib/auth-display-name'

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

function readExistingAuthNames(metadata: Record<string, unknown> | undefined): {
  displayName: string | null
  fullName: string | null
} {
  const displayName =
    typeof metadata?.display_name === 'string' ? metadata.display_name : null
  const fullName =
    typeof metadata?.full_name === 'string' ? metadata.full_name : null
  return { displayName, fullName }
}

/**
 * Mirrors profiles.full_name → Auth user_metadata.display_name (+ full_name).
 * Server-only usage (admin client / service role). Never import from client components.
 * Does not use Auth metadata for roles, entitlements, approval, billing, or RLS.
 */
export async function syncAuthDisplayNameFromProfile(input: {
  userId: string
  publicFacingName: string | null | undefined
  admin?: AdminClient | null
}): Promise<
  | { ok: true; updated: boolean }
  | { ok: false; skipped: true }
  | { ok: false; error: string }
> {
  const name = normalizePublicFacingName(input.publicFacingName)
  if (!name) {
    return { ok: false, skipped: true }
  }

  const admin = input.admin ?? createAdminClient()
  if (!admin) {
    return { ok: false, error: 'Admin client unavailable.' }
  }

  const { data: userData, error: getError } = await admin.auth.admin.getUserById(
    input.userId
  )
  if (getError || !userData.user) {
    captureOperationalError('sync_auth_display_name_get', getError ?? 'missing_user')
    return { ok: false, error: 'Failed to load auth user.' }
  }

  const existing = readExistingAuthNames(
    userData.user.user_metadata as Record<string, unknown> | undefined
  )

  if (
    !shouldSyncAuthDisplayName({
      publicFacingName: name,
      existingDisplayName: existing.displayName,
      existingFullName: existing.fullName,
    })
  ) {
    return { ok: true, updated: false }
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    input.userId,
    {
      user_metadata: authDisplayNameMetadata(name),
    }
  )

  if (updateError) {
    captureOperationalError('sync_auth_display_name_update', updateError)
    return { ok: false, error: 'Failed to update auth display name.' }
  }

  return { ok: true, updated: true }
}

/** Best-effort wrapper for application/profile write paths. */
export async function syncAuthDisplayNameBestEffort(input: {
  userId: string
  publicFacingName: string | null | undefined
}): Promise<void> {
  const result = await syncAuthDisplayNameFromProfile(input)
  if (!result.ok && !('skipped' in result && result.skipped)) {
    captureOperationalError(
      'sync_auth_display_name_best_effort',
      'error' in result ? result.error : 'unknown'
    )
  }
}

const BACKFILL_PAGE_SIZE = 100

/**
 * Idempotent backfill: profiles.id → auth.users id; profiles.full_name → metadata.
 * Skips blank names. Reports counts only — never logs names/emails/secrets.
 */
export async function backfillAuthDisplayNames(input?: {
  admin?: AdminClient | null
  pageSize?: number
}): Promise<AuthDisplayNameBackfillCounts> {
  const admin = input?.admin ?? createAdminClient()
  let counts = emptyAuthDisplayNameBackfillCounts()

  if (!admin) {
    captureOperationalError(
      'backfill_auth_display_names',
      'Admin client unavailable.'
    )
    return recordAuthDisplayNameBackfillResult(counts, 'failed')
  }

  const pageSize = input?.pageSize ?? BACKFILL_PAGE_SIZE
  let from = 0

  for (;;) {
    const { data: rows, error } = await admin
      .from('profiles')
      .select('id, full_name')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      captureOperationalError('backfill_auth_display_names_page', error)
      return recordAuthDisplayNameBackfillResult(counts, 'failed')
    }

    const page = rows ?? []
    if (page.length === 0) break

    for (const row of page) {
      const name = normalizePublicFacingName(row.full_name)
      if (!name) {
        counts = recordAuthDisplayNameBackfillResult(counts, 'skipped')
        continue
      }

      const result = await syncAuthDisplayNameFromProfile({
        userId: row.id,
        publicFacingName: name,
        admin,
      })

      if (result.ok) {
        counts = recordAuthDisplayNameBackfillResult(
          counts,
          result.updated ? 'updated' : 'skipped'
        )
      } else if ('skipped' in result && result.skipped) {
        counts = recordAuthDisplayNameBackfillResult(counts, 'skipped')
      } else {
        counts = recordAuthDisplayNameBackfillResult(counts, 'failed')
      }
    }

    if (page.length < pageSize) break
    from += pageSize
  }

  return counts
}

export type AuthDisplayNameAdmin = SupabaseClient<Database>
