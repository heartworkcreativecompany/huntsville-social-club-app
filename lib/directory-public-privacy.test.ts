import { describe, expect, it } from 'vitest'
import type { DirectoryMember } from '@/lib/members-discovery'

describe('directory / public profile privacy', () => {
  it('does not expose billing, ledger, or credit fields on DirectoryMember', () => {
    const keys: Array<keyof DirectoryMember> = [
      'id',
      'contactEmail',
      'full_name',
      'role',
      'created_at',
      'membership_intent',
      'verified_at',
      'membership_status',
      'photos',
      'location_area',
      'discovery_intent',
      'location_city',
      'location_zip',
      'birth_year',
      'discovery_interests',
      'discovery_industry',
      'public_intents',
      'verification_state',
      'membership_tier',
      'vendor_reviewed_badge',
      'recognitionBadges',
    ]

    expect(keys).not.toContain('membership_billing' as never)
    expect(keys).not.toContain('premiumCreditsRemaining' as never)
    expect(keys).not.toContain('circleSocialCreditsRemaining' as never)
    expect(keys).not.toContain('stripe_customer_id' as never)
    expect(keys).not.toContain('stripe_subscription_id' as never)
    expect(keys).not.toContain('credits_used' as never)
  })
})
