/**
 * One-time / ops backfill: profiles.full_name → Auth user_metadata.display_name.
 *
 * Usage (from repo root):
 *   npm run backfill:auth-display-names
 *
 * Loads `.env.local` for local CLI runs when vars are unset (does not override
 * existing process env — production/CI remains unaffected).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Prints updated/skipped/failed counts only — never names, emails, or secrets.
 */

import { loadLocalEnvFile } from '../lib/cli/load-local-env'
import {
  formatMissingAdminClientEnvMessage,
  missingAdminClientEnvVars,
} from '../lib/supabase/admin-env'
import { createAdminClient } from '../lib/supabase/admin'
import { backfillAuthDisplayNames } from '../lib/sync-auth-display-name'

async function main() {
  // Local DX only: tsx does not load Next.js .env files automatically.
  loadLocalEnvFile()

  const missing = missingAdminClientEnvVars()
  if (missing.length > 0) {
    console.error(
      JSON.stringify({
        ok: false,
        error: formatMissingAdminClientEnvMessage(missing),
      })
    )
    process.exit(1)
  }

  const admin = createAdminClient()
  if (!admin) {
    console.error(
      JSON.stringify({
        ok: false,
        error: formatMissingAdminClientEnvMessage(
          missingAdminClientEnvVars()
        ),
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
