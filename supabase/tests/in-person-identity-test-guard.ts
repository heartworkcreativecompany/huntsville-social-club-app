/**
 * Fail closed before the in-person identity suite opens a connection.
 * Loopback is not enough: the database name must be the dedicated
 * disposable database, and the destructive opt-in must be set.
 * Error text never includes the connection string.
 */

export const IN_PERSON_IDENTITY_DATABASE_NAME = 'hsc_in_person_identity_test'
export const IN_PERSON_IDENTITY_DATABASE_URL_ENV = 'IN_PERSON_IDENTITY_DATABASE_URL'
export const IN_PERSON_IDENTITY_DESTRUCTIVE_OPT_IN =
  'IN_PERSON_IDENTITY_DESTRUCTIVE_TEST'
export const IN_PERSON_IDENTITY_MAINTENANCE_DATABASE = 'postgres'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export type InPersonIdentityTestTarget = {
  databaseUrl: string
  databaseName: string
  hostname: string
  port: string
}

function refuse(reason: string): never {
  throw new Error(`Refusing in-person identity SQL: ${reason}`)
}

export function assertInPersonIdentityTestAllowed(
  env: NodeJS.ProcessEnv = process.env
): InPersonIdentityTestTarget {
  if (env[IN_PERSON_IDENTITY_DESTRUCTIVE_OPT_IN] !== '1') {
    refuse(
      `${IN_PERSON_IDENTITY_DESTRUCTIVE_OPT_IN}=1 is required before any connection.`
    )
  }

  const raw = env[IN_PERSON_IDENTITY_DATABASE_URL_ENV]?.trim() ?? ''
  if (!raw) {
    refuse(
      `${IN_PERSON_IDENTITY_DATABASE_URL_ENV} must name the disposable test database.`
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
  const exactDatabaseName: string = IN_PERSON_IDENTITY_DATABASE_NAME
  const maintenanceDatabaseName: string = IN_PERSON_IDENTITY_MAINTENANCE_DATABASE
  if (
    databaseName === maintenanceDatabaseName ||
    !databaseName.endsWith('_test')
  ) {
    refuse('the database name is not test-only.')
  }
  if (databaseName !== exactDatabaseName) {
    refuse(
      `the database name must be ${IN_PERSON_IDENTITY_DATABASE_NAME}. Loopback does not authorize another database.`
    )
  }

  return {
    databaseUrl: raw,
    databaseName,
    hostname,
    port: parsed.port,
  }
}

export function inPersonIdentityMaintenanceDatabaseUrl(
  target: InPersonIdentityTestTarget
): string {
  let parsed: URL
  try {
    parsed = new URL(target.databaseUrl)
  } catch {
    refuse('the database URL is not a postgres URL.')
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (
    target.databaseName !== IN_PERSON_IDENTITY_DATABASE_NAME ||
    databaseName !== IN_PERSON_IDENTITY_DATABASE_NAME ||
    !LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    refuse('maintenance URL was requested for a different target.')
  }
  parsed.pathname = `/${IN_PERSON_IDENTITY_MAINTENANCE_DATABASE}`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}
