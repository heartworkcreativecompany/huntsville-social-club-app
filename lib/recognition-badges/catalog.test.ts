import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ADMIN_NOT_AUTHORIZED_ERROR,
  PUBLIC_RECOGNITION_BADGE_COLUMNS,
  RECOGNITION_BADGE_SLUGS,
  SEEDED_RECOGNITION_BADGES,
  awardRecognitionBadgeConfirmationCopy,
  publicRecognitionBadgePayload,
  recognitionBadgeAuditDetails,
  revokeRecognitionBadgeConfirmationCopy,
  toPublicRecognitionBadges,
} from '@/lib/recognition-badges/catalog'

describe('recognition badge catalog', () => {
  it('seeds the three public catalog badges', () => {
    expect(RECOGNITION_BADGE_SLUGS).toEqual([
      'founding_member',
      'premium_sponsor',
      'experience_partner',
    ])
    expect(SEEDED_RECOGNITION_BADGES.map((badge) => badge.publicLabel)).toEqual([
      'Founding Member',
      'Premium Sponsor',
      'Experience Partner',
    ])
    expect(SEEDED_RECOGNITION_BADGES[0]?.publicDescription).toBe(
      'Recognized as an early member of Huntsville Social Club.'
    )
  })

  it('strips admin notes, actors, and revoked rows from public payloads', () => {
    const publicBadges = toPublicRecognitionBadges([
      {
        badge_slug: 'founding_member',
        public_label: 'Founding Member',
        admin_note: 'Keep this private',
        awarded_by: 'admin-1',
        revoked_by: null,
        revoked_at: null,
      },
      {
        badge_slug: 'premium_sponsor',
        public_label: 'Premium Sponsor',
        admin_note: 'Also private',
        awarded_by: 'admin-1',
        revoked_at: '2026-08-01T00:00:00.000Z',
        revoked_by: 'admin-1',
      },
    ])

    expect(publicBadges).toEqual([
      { slug: 'founding_member', publicLabel: 'Founding Member' },
    ])
    expect(JSON.stringify(publicRecognitionBadgePayload(publicBadges))).not.toContain(
      'Keep this private'
    )
    expect(JSON.stringify(publicBadges)).not.toContain('admin_note')
    expect(JSON.stringify(publicBadges)).not.toContain('admin-1')
  })

  it('keeps public selects limited to label columns', () => {
    expect(PUBLIC_RECOGNITION_BADGE_COLUMNS).toBe(
      'user_id, badge_slug, public_label, display_order'
    )
    expect(PUBLIC_RECOGNITION_BADGE_COLUMNS).not.toMatch(
      /admin_note|awarded_by|revoked_by|revoked_at/
    )
  })

  it('uses explicit award and revoke confirmation copy', () => {
    expect(
      awardRecognitionBadgeConfirmationCopy(['Founding Member'], 'Alex Rivera')
    ).toBe(
      'Award “Founding Member” to Alex Rivera? This is a public recognition label. It does not change membership, billing, or access.'
    )
    expect(
      awardRecognitionBadgeConfirmationCopy(
        ['Founding Member', 'Premium Sponsor'],
        'Alex Rivera'
      )
    ).toBe(
      'Award “Founding Member”, “Premium Sponsor” to Alex Rivera? These are public recognition labels. They do not change membership, billing, or access.'
    )
    expect(
      revokeRecognitionBadgeConfirmationCopy('Founding Member', 'Alex Rivera')
    ).toBe(
      'Revoke “Founding Member” from Alex Rivera? This removes the public label. It does not change membership, billing, or access.'
    )
  })

  it('stores an admin-note indicator in audit details, never the note text', () => {
    const details = recognitionBadgeAuditDetails({
      slug: 'founding_member',
      publicLabel: 'Founding Member',
      adminNote: 'Internal sponsor review',
    })
    expect(JSON.parse(details)).toEqual({
      slug: 'founding_member',
      public_label: 'Founding Member',
      has_admin_note: true,
    })
    expect(details).not.toContain('Internal sponsor review')
    expect(ADMIN_NOT_AUTHORIZED_ERROR).toBe('Administrator access required.')
  })

  it('does not persist billing or entitlement fields in the migration', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260823220000_recognition_badges.sql'),
      'utf8'
    )
    expect(sql).toContain('unique index')
    expect(sql).toContain('where revoked_at is null')
    expect(sql).toContain('founding_member')
    expect(sql).toContain(
      'Recognized as an early member of Huntsville Social Club.'
    )
    expect(sql).toContain('premium_sponsor')
    expect(sql).toContain('experience_partner')
    expect(sql).toMatch(/create table if not exists public\.recognition_badges/)
    expect(sql).toMatch(/create table if not exists public\.member_recognition_badge_awards/)
    expect(sql).not.toMatch(
      /\b(stripe_customer_id|stripe_subscription_id|coupon_code|membership_billing|entitlement_cycle)\b/
    )
  })
})
