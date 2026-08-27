import { describe, expect, it } from 'vitest'
import { emptyDraft } from '@/lib/application'
import {
  adminApplicationAboutRows,
  adminApplicationBio,
  adminApplicationLookingForLabel,
  adminMemberApplicationDetailSections,
  bioFromMembershipIntentColumn,
  showPremiumVendorVerificationOnMemberApplication,
} from '@/lib/admin-application-review'

describe('admin application field mapping', () => {
  it('treats profiles.membership_intent as bio storage, not Intent', () => {
    expect(bioFromMembershipIntentColumn('I love Huntsville events')).toBe(
      'I love Huntsville events'
    )
  })

  it('puts the member applicant bio under About you as Bio', () => {
    const draft = emptyDraft()
    draft.profile.aboutMe = 'Friendly local looking for community.'
    draft.prompts.bringsYouHere = 'New friends'
    draft.profile.connectionIntents = ['networking']

    const about = adminApplicationAboutRows(draft)
    expect(about[0]).toEqual({
      key: 'bio',
      label: 'Bio',
      value: 'Friendly local looking for community.',
    })
    expect(about.some((row) => row.label === 'Intent')).toBe(false)
    expect(adminApplicationBio(draft)).toBe(
      'Friendly local looking for community.'
    )
    expect(adminApplicationLookingForLabel(draft)).toBe('Networking')
    expect(
      about.some(
        (row) =>
          row.key === 'bringsYouHere' &&
          row.label === 'What brings you to the club most right now?' &&
          row.value === 'New friends'
      )
    ).toBe(true)
    expect(
      about.some((row) => row.key === 'hopingToMeet' && row.value === '—')
    ).toBe(true)
  })

  it('does not surface vendor-verification on standard member applications', () => {
    expect(showPremiumVendorVerificationOnMemberApplication()).toBe(false)
    const sections = adminMemberApplicationDetailSections({
      includeRemoveMember: true,
    })
    expect(sections).not.toContain('premium_vendor_verification')
    expect(sections).toContain('about_you')
    expect(sections).toContain('review_actions')
    expect(sections).toContain('remove_member')
  })

  it('keeps review and remove-member admin controls in the member detail sections', () => {
    const withRemove = adminMemberApplicationDetailSections({
      includeRemoveMember: true,
    })
    const withoutRemove = adminMemberApplicationDetailSections({
      includeRemoveMember: false,
    })
    expect(withRemove).toContain('review_actions')
    expect(withRemove).toContain('remove_member')
    expect(withoutRemove).toContain('review_actions')
    expect(withoutRemove).not.toContain('remove_member')
  })
})
