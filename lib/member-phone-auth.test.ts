import { describe, expect, it } from 'vitest'
import {
  authPhoneConfirmedForSubmittedE164,
  authPhoneMatchesSubmittedE164,
  pendingAuthPhoneChangeE164,
} from '@/lib/member-phone-auth'

describe('member-phone-auth', () => {
  it('matches pending new_phone before phone_change verify completes', () => {
    expect(
      authPhoneMatchesSubmittedE164(
        { phone: '+12565550100', new_phone: '+12565550999' },
        '+12565550999'
      )
    ).toBe(true)
    expect(
      authPhoneConfirmedForSubmittedE164(
        { phone: '+12565550100', new_phone: '+12565550999' },
        '+12565550999'
      )
    ).toBe(false)
  })

  it('requires confirmed auth phone after verify', () => {
    expect(
      authPhoneConfirmedForSubmittedE164(
        { phone: '+12565550999' },
        '+12565550999'
      )
    ).toBe(true)
    expect(pendingAuthPhoneChangeE164({ new_phone: '+12565550999' })).toBe(
      '+12565550999'
    )
  })
})
