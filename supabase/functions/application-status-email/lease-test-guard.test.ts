import { describe, expect, it } from 'vitest'
import {
  LEASE_TEST_DATABASE_NAME,
  LEASE_TEST_DATABASE_URL_ENV,
  LEASE_TEST_DESTRUCTIVE_OPT_IN,
  assertLeaseDestructiveTestAllowed,
  leaseMaintenanceDatabaseUrl,
} from './lease-test-guard.ts'

const SAFE_URL = `postgres://postgres@127.0.0.1:55432/${LEASE_TEST_DATABASE_NAME}`

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    [LEASE_TEST_DESTRUCTIVE_OPT_IN]: '1',
    [LEASE_TEST_DATABASE_URL_ENV]: SAFE_URL,
    ...overrides,
  }
}

describe('lease destructive-test guard', () => {
  it('allows loopback, the dedicated test database, and the opt-in together', () => {
    const target = assertLeaseDestructiveTestAllowed(env({}))
    expect(target).toMatchObject({
      databaseName: LEASE_TEST_DATABASE_NAME,
      hostname: '127.0.0.1',
      port: '55432',
    })
    expect(leaseMaintenanceDatabaseUrl(target)).toBe(
      'postgres://postgres@127.0.0.1:55432/postgres'
    )
  })

  it('refuses when the destructive opt-in is missing', () => {
    expect(() =>
      assertLeaseDestructiveTestAllowed(
        env({ [LEASE_TEST_DESTRUCTIVE_OPT_IN]: undefined })
      )
    ).toThrow(/APPLICATION_EMAIL_LEASE_DESTRUCTIVE_TEST=1/)
  })

  it('refuses loopback port 55432 when the database is not the disposable test database', () => {
    expect(() =>
      assertLeaseDestructiveTestAllowed(
        env({
          [LEASE_TEST_DATABASE_URL_ENV]:
            'postgres://postgres@127.0.0.1:55432/postgres',
        })
      )
    ).toThrow(new RegExp(LEASE_TEST_DATABASE_NAME))
  })

  it('refuses a non-loopback host even with the test database and opt-in', () => {
    expect(() =>
      assertLeaseDestructiveTestAllowed(
        env({
          [LEASE_TEST_DATABASE_URL_ENV]: `postgres://postgres@db.example.com:55432/${LEASE_TEST_DATABASE_NAME}`,
        })
      )
    ).toThrow(/loopback/)
  })

  it('does not echo the connection string when refusing', () => {
    const secretUrl =
      'postgres://postgres:super-secret-password@10.1.2.3/production'
    let message = ''
    try {
      assertLeaseDestructiveTestAllowed(
        env({ [LEASE_TEST_DATABASE_URL_ENV]: secretUrl })
      )
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('loopback')
    expect(message).not.toContain('super-secret-password')
    expect(message).not.toContain('10.1.2.3')
    expect(message).not.toContain('production')
  })
})
