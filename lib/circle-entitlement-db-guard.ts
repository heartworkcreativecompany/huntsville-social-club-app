/**
 * Fail closed before the Circle entitlement suite opens a connection.
 * Loopback is not enough: the database name must be the dedicated disposable
 * database, and the destructive opt-in must be set. Error text never includes
 * the connection string.
 */

export const CIRCLE_ENTITLEMENT_TEST_DATABASE_NAME = 'hsc_circle_entitlement_test'
export const CIRCLE_ENTITLEMENT_DATABASE_URL_ENV = 'CIRCLE_ENTITLEMENT_DATABASE_URL'
export const CIRCLE_ENTITLEMENT_DESTRUCTIVE_OPT_IN =
  'CIRCLE_ENTITLEMENT_DESTRUCTIVE_TEST'
export const CIRCLE_ENTITLEMENT_MAINTENANCE_DATABASE = 'postgres'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export type CircleEntitlementTestTarget = {
  databaseUrl: string
  databaseName: string
  hostname: string
  port: string
}

function refuse(reason: string): never {
  throw new Error(`Refusing destructive entitlement SQL: ${reason}`)
}

export function assertCircleEntitlementDestructiveTestAllowed(
  env: NodeJS.ProcessEnv = process.env
): CircleEntitlementTestTarget {
  if (env[CIRCLE_ENTITLEMENT_DESTRUCTIVE_OPT_IN] !== '1') {
    refuse(
      `${CIRCLE_ENTITLEMENT_DESTRUCTIVE_OPT_IN}=1 is required before any connection.`
    )
  }

  const raw = env[CIRCLE_ENTITLEMENT_DATABASE_URL_ENV]?.trim() ?? ''
  if (!raw) {
    refuse(
      `${CIRCLE_ENTITLEMENT_DATABASE_URL_ENV} must name the disposable test database.`
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
  if (databaseName !== CIRCLE_ENTITLEMENT_TEST_DATABASE_NAME) {
    refuse(
      `the database name must be ${CIRCLE_ENTITLEMENT_TEST_DATABASE_NAME}. Port and loopback do not authorize another database.`
    )
  }

  return {
    databaseUrl: raw,
    databaseName,
    hostname,
    port: parsed.port,
  }
}

export function circleEntitlementMaintenanceDatabaseUrl(
  target: CircleEntitlementTestTarget
): string {
  const parsed = new URL(target.databaseUrl)
  parsed.pathname = `/${CIRCLE_ENTITLEMENT_MAINTENANCE_DATABASE}`
  return parsed.toString()
}
