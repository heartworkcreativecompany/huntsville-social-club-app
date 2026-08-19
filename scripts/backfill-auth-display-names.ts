/**
 * One-time / ops backfill: profiles.full_name → Auth user_metadata.display_name.
 *
 * Usage (from repo root, with env loaded):
 *   npx --yes tsx scripts/backfill-auth-display-names.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Prints updated/skipped/failed counts only — never names, emails, or secrets.
 */

import { createAdminClient } from '../lib/supabase/admin'
import { backfillAuthDisplayNames } from '../lib/sync-auth-display-name'

async function main() {
  const admin = createAdminClient()
  if (!admin) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'missing_admin_client',
      })
    )
    process.exit(1)
  }

  const counts = await backfillAuthDisplayNames({ admin })
  console.log(
    JSON.stringify({
      ok: true,
      updated: counts.updated,
      skipped: counts.skipped,
      failed: counts.failed,
    })
  )

  if (counts.failed > 0) {
    process.exit(2)
  }
}

main().catch(() => {
  console.error(JSON.stringify({ ok: false, error: 'backfill_failed' }))
  process.exit(1)
})
