/**
 * Fail closed before the lease integration suite opens a connection.
 * Loopback and port 55432 are not enough: the database name must be the
 * dedicated disposable database, and the destructive opt-in must be set.
 * Error text never includes the connection string.
 */

export const LEASE_TEST_DATABASE_NAME = 'hsc_application_email_lease_test'
export const LEASE_TEST_DATABASE_URL_ENV = 'LEASE_TEST_DATABASE_URL'
export const LEASE_TEST_DESTRUCTIVE_OPT_IN = 'APPLICATION_EMAIL_LEASE_DESTRUCTIVE_TEST'
export const LEASE_TEST_MAINTENANCE_DATABASE = 'postgres'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export type LeaseTestTarget = {
  databaseUrl: string
  databaseName: string
  hostname: string
  port: string
}

function refuse(reason: string): never {
  throw new Error(`Refusing destructive lease SQL: ${reason}`)
}

export function assertLeaseDestructiveTestAllowed(
  env: NodeJS.ProcessEnv = process.env
): LeaseTestTarget {
  if (env[LEASE_TEST_DESTRUCTIVE_OPT_IN] !== '1') {
    refuse(
      `${LEASE_TEST_DESTRUCTIVE_OPT_IN}=1 is required before any connection.`
    )
  }

  const raw = env[LEASE_TEST_DATABASE_URL_ENV]?.trim() ?? ''
  if (!raw) {
    refuse(`${LEASE_TEST_DATABASE_URL_ENV} must name the disposable test database.`)
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
  if (databaseName !== LEASE_TEST_DATABASE_NAME) {
    refuse(
      `the database name must be ${LEASE_TEST_DATABASE_NAME}. Port and loopback do not authorize another database.`
    )
  }
  if (
    databaseName === LEASE_TEST_MAINTENANCE_DATABASE ||
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

export function leaseMaintenanceDatabaseUrl(target: LeaseTestTarget): string {
  let parsed: URL
  try {
    parsed = new URL(target.databaseUrl)
  } catch {
    refuse('the database URL is not a postgres URL.')
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (
    target.databaseName !== LEASE_TEST_DATABASE_NAME ||
    databaseName !== LEASE_TEST_DATABASE_NAME ||
    !LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    refuse('maintenance URL was requested for a different target.')
  }
  parsed.pathname = `/${LEASE_TEST_MAINTENANCE_DATABASE}`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

