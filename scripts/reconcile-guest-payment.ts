/**
 * Mark one guest registration paid from its stored Stripe Checkout session.
 *
 * Usage:
 *   npx tsx scripts/reconcile-guest-payment.ts <guest-registration-id> [--dry-run]
 *
 * --dry-run prints the outcome and does not write. Prints only the
 * registration id and the outcome. Does not create Checkout sessions.
 */

import { loadLocalEnvFile } from '../lib/cli/load-local-env'
import { reconcileGuestPayment } from '../lib/reconcile-guest-payment'
import { getStripe } from '../lib/stripe/config'
import { createAdminClient } from '../lib/supabase/admin'

const REGISTRATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const registrationId = args.find((arg) => arg !== '--dry-run') ?? ''
  if (!REGISTRATION_ID.test(registrationId)) {
    process.exit(1)
  }

  loadLocalEnvFile()
  const admin = createAdminClient()
  if (!admin) {
    console.log(`${registrationId} refused`)
    process.exit(1)
  }

  let outcome: string
  try {
    outcome = await reconcileGuestPayment(admin, getStripe(), registrationId, {
      dryRun,
    })
  } catch {
    outcome = 'refused'
  }

  console.log(`${registrationId} ${outcome}`)
  if (outcome === 'refused') process.exit(1)
}

main().catch(() => {
  process.exit(1)
})
