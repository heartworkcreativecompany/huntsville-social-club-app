import { describe, expect, it } from 'vitest'
import { assertCircleEntitlementDestructiveTestAllowed } from '@/lib/circle-entitlement-db-guard'

describe('circle entitlement database guard', () => {
  it('refuses to connect without the disposable-database opt-in', () => {
    expect(() =>
      assertCircleEntitlementDestructiveTestAllowed({
        CIRCLE_ENTITLEMENT_DATABASE_URL:
          'postgres://postgres@127.0.0.1:55433/hsc_circle_entitlement_test',
      })
    ).toThrow(/CIRCLE_ENTITLEMENT_DESTRUCTIVE_TEST=1/)
  })

  it('refuses a non-loopback host and any other database name', () => {
    expect(() =>
      assertCircleEntitlementDestructiveTestAllowed({
        CIRCLE_ENTITLEMENT_DESTRUCTIVE_TEST: '1',
        CIRCLE_ENTITLEMENT_DATABASE_URL:
          'postgres://postgres@example.com:55433/hsc_circle_entitlement_test',
      })
    ).toThrow(/loopback/)

    expect(() =>
      assertCircleEntitlementDestructiveTestAllowed({
        CIRCLE_ENTITLEMENT_DESTRUCTIVE_TEST: '1',
        CIRCLE_ENTITLEMENT_DATABASE_URL: 'postgres://postgres@127.0.0.1:55433/postgres',
      })
    ).toThrow(/hsc_circle_entitlement_test/)
  })
})
