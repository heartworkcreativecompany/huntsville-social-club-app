import { describe, expect, it } from 'vitest'
import {
  MESSAGING_POLICY_DATABASE_NAME,
  MESSAGING_POLICY_DATABASE_URL_ENV,
  MESSAGING_POLICY_DESTRUCTIVE_OPT_IN,
  MESSAGING_POLICY_MAINTENANCE_DATABASE,
  assertMessagingPolicyTestAllowed,
  messagingPolicyMaintenanceDatabaseUrl,
} from './messaging-policy-test-guard.ts'

const ACCEPTED_URL = 'postgres://postgres@127.0.0.1:55432/hsc_messaging_policy_test'

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    [MESSAGING_POLICY_DESTRUCTIVE_OPT_IN]: '1',
    [MESSAGING_POLICY_DATABASE_URL_ENV]: ACCEPTED_URL,
    ...overrides,
  }
}

describe('messaging policy test guard', () => {
  it('accepts only the disposable test database on loopback', () => {
    const accepted = assertMessagingPolicyTestAllowed(env())
    expect(accepted).toMatchObject({
      databaseUrl: ACCEPTED_URL,
      databaseName: MESSAGING_POLICY_DATABASE_NAME,
      hostname: '127.0.0.1',
      port: '55432',
    })
    expect(accepted.databaseName).toBe('hsc_messaging_policy_test')

    expect(
      assertMessagingPolicyTestAllowed(
        env({
          [MESSAGING_POLICY_DATABASE_URL_ENV]:
            'postgresql://postgres@localhost:55432/hsc_messaging_policy_test',
        })
      ).hostname
    ).toBe('localhost')
  })

  it('rejects the maintenance database and every other database name', () => {
    const rejected = [
      'postgres://postgres@127.0.0.1:55432/postgres',
      'postgres://postgres@127.0.0.1:55432/template1',
      'postgres://postgres@127.0.0.1:55432/huntsville',
      'postgres://postgres@127.0.0.1:55432/hsc_messaging_policy',
      'postgres://postgres@127.0.0.1:55432/',
      'postgres://postgres@localhost:5432/postgres',
    ]

    for (const databaseUrl of rejected) {
      expect(() =>
        assertMessagingPolicyTestAllowed(
          env({ [MESSAGING_POLICY_DATABASE_URL_ENV]: databaseUrl })
        )
      ).toThrow(/not test-only/)
    }

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({
          [MESSAGING_POLICY_DATABASE_URL_ENV]:
            'postgres://postgres@127.0.0.1:55432/other_test',
        })
      )
    ).toThrow(/must be hsc_messaging_policy_test/)

    expect(MESSAGING_POLICY_MAINTENANCE_DATABASE).toBe('postgres')
  })

  it('rejects missing, malformed, remote, and non-postgres configuration', () => {
    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({ [MESSAGING_POLICY_DESTRUCTIVE_OPT_IN]: undefined })
      )
    ).toThrow(/MESSAGING_POLICY_DESTRUCTIVE_TEST=1 is required/)

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({ [MESSAGING_POLICY_DESTRUCTIVE_OPT_IN]: 'true' })
      )
    ).toThrow(/MESSAGING_POLICY_DESTRUCTIVE_TEST=1 is required/)

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({ [MESSAGING_POLICY_DATABASE_URL_ENV]: undefined })
      )
    ).toThrow(/MESSAGING_POLICY_DATABASE_URL must name the disposable test database/)

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({ [MESSAGING_POLICY_DATABASE_URL_ENV]: '   ' })
      )
    ).toThrow(/MESSAGING_POLICY_DATABASE_URL must name the disposable test database/)

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({ [MESSAGING_POLICY_DATABASE_URL_ENV]: 'not a url' })
      )
    ).toThrow(/not a postgres URL/)

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({
          [MESSAGING_POLICY_DATABASE_URL_ENV]:
            'http://127.0.0.1:55432/hsc_messaging_policy_test',
        })
      )
    ).toThrow(/not a postgres URL/)

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({
          [MESSAGING_POLICY_DATABASE_URL_ENV]: `${ACCEPTED_URL}?sslmode=disable`,
        })
      )
    ).toThrow(/must not include query or fragment/)

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({
          [MESSAGING_POLICY_DATABASE_URL_ENV]: `${ACCEPTED_URL}#fragment`,
        })
      )
    ).toThrow(/must not include query or fragment/)

    expect(() =>
      assertMessagingPolicyTestAllowed(
        env({
          [MESSAGING_POLICY_DATABASE_URL_ENV]:
            'postgres://postgres@db.example:5432/hsc_messaging_policy_test',
        })
      )
    ).toThrow(/connection host must be loopback/)
  })

  it('builds a maintenance URL only for an already accepted target', () => {
    const target = assertMessagingPolicyTestAllowed(env())
    const maintenance = new URL(messagingPolicyMaintenanceDatabaseUrl(target))
    expect(maintenance.pathname).toBe(`/${MESSAGING_POLICY_MAINTENANCE_DATABASE}`)
    expect(maintenance.hostname).toBe('127.0.0.1')
    expect(maintenance.search).toBe('')
    expect(maintenance.hash).toBe('')

    expect(() =>
      messagingPolicyMaintenanceDatabaseUrl({
        ...target,
        databaseName: 'postgres',
      })
    ).toThrow(/different target/)
  })
})
