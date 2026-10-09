/**
 * Fail closed before the messaging-policy suite opens a connection.
 * Loopback is not enough: the database name must be the dedicated
 * disposable database, and the destructive opt-in must be set.
 * Error text never includes the connection string.
 */

export const MESSAGING_POLICY_DATABASE_NAME = 'hsc_messaging_policy_test'
export const MESSAGING_POLICY_DATABASE_URL_ENV = 'MESSAGING_POLICY_DATABASE_URL'
export const MESSAGING_POLICY_DESTRUCTIVE_OPT_IN =
  'MESSAGING_POLICY_DESTRUCTIVE_TEST'
export const MESSAGING_POLICY_MAINTENANCE_DATABASE = 'postgres'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export type MessagingPolicyTestTarget = {
  databaseUrl: string
  databaseName: string
  hostname: string
  port: string
}

function refuse(reason: string): never {
  throw new Error(`Refusing messaging-policy SQL: ${reason}`)
}

export function assertMessagingPolicyTestAllowed(
  env: NodeJS.ProcessEnv = process.env
): MessagingPolicyTestTarget {
  if (env[MESSAGING_POLICY_DESTRUCTIVE_OPT_IN] !== '1') {
    refuse(
      `${MESSAGING_POLICY_DESTRUCTIVE_OPT_IN}=1 is required before any connection.`
    )
  }

  const raw = env[MESSAGING_POLICY_DATABASE_URL_ENV]?.trim() ?? ''
  if (!raw) {
    refuse(
      `${MESSAGING_POLICY_DATABASE_URL_ENV} must name the disposable test database.`
    )
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    refuse('the database URL is not a postgres URL.')
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    refuse('the database URL is not a postgres URL.')
  }
  if (parsed.search || parsed.hash) {
    refuse('the database URL must not include query or fragment parameters.')
  }

  const hostname = parsed.hostname
  if (!LOOPBACK_HOSTS.has(hostname)) {
    refuse('the connection host must be loopback.')
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (databaseName !== MESSAGING_POLICY_DATABASE_NAME) {
    refuse(
      `the database name must be ${MESSAGING_POLICY_DATABASE_NAME}. Loopback does not authorize another database.`
    )
  }
  if (
    databaseName === MESSAGING_POLICY_MAINTENANCE_DATABASE ||
    !databaseName.endsWith('_test')
  ) {
    refuse('the database name is not test-only.')
  }

  return {
    databaseUrl: raw,
    databaseName,
    hostname,
    port: parsed.port,
  }
}

export function messagingPolicyMaintenanceDatabaseUrl(
  target: MessagingPolicyTestTarget
): string {
  let parsed: URL
  try {
    parsed = new URL(target.databaseUrl)
  } catch {
    refuse('the database URL is not a postgres URL.')
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (
    target.databaseName !== MESSAGING_POLICY_DATABASE_NAME ||
    databaseName !== MESSAGING_POLICY_DATABASE_NAME ||
    !LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    refuse('maintenance URL was requested for a different target.')
  }
  parsed.pathname = `/${MESSAGING_POLICY_MAINTENANCE_DATABASE}`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}
