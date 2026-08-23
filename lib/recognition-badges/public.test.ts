import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  attachPublicRecognitionBadges,
  loadPublicRecognitionBadgesByUserIds,
} from '@/lib/recognition-badges/public'
import { PUBLIC_RECOGNITION_BADGE_COLUMNS } from '@/lib/recognition-badges/catalog'

type QueryResult = {
  data?: unknown
  error?: { code?: string; message?: string } | null
}

function createQuery(result: QueryResult) {
  const query: Record<string, unknown> = {}
  const chain = () => query
  query.select = chain
  query.in = chain
  query.order = chain
  query.then = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(result).then(resolve)
  return query
}

function createClient(result: QueryResult): SupabaseClient<Database> {
  return {
    from(table: string) {
      expect(table).toBe('member_public_recognition_badges')
      return createQuery(result)
    },
  } as unknown as SupabaseClient<Database>
}

describe('public recognition badge loader', () => {
  it('maps only active public labels and never includes admin notes', async () => {
    const client = createClient({
      data: [
        {
          user_id: 'member-1',
          badge_slug: 'founding_member',
          public_label: 'Founding Member',
          display_order: 10,
          admin_note: 'should never be selected',
        },
        {
          user_id: 'member-1',
          badge_slug: 'experience_partner',
          public_label: 'Experience Partner',
          display_order: 30,
        },
      ],
      error: null,
    })

    const badges = await loadPublicRecognitionBadgesByUserIds(client, ['member-1'])
    expect(badges.get('member-1')).toEqual([
      { slug: 'founding_member', publicLabel: 'Founding Member' },
      { slug: 'experience_partner', publicLabel: 'Experience Partner' },
    ])
    expect(JSON.stringify([...badges.values()])).not.toContain('should never be selected')
    expect(PUBLIC_RECOGNITION_BADGE_COLUMNS).not.toContain('admin_note')
  })

  it('returns an empty map when the public view is missing', async () => {
    const client = createClient({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })
    const badges = await loadPublicRecognitionBadgesByUserIds(client, ['member-1'])
    expect(badges.size).toBe(0)
  })

  it('attaches public badges to directory members without private fields', async () => {
    const client = createClient({
      data: [
        {
          user_id: 'member-1',
          badge_slug: 'premium_sponsor',
          public_label: 'Premium Sponsor',
          display_order: 20,
        },
      ],
      error: null,
    })

    const [member] = await attachPublicRecognitionBadges(client, [
      { id: 'member-1', recognitionBadges: [] },
    ])
    expect(member.recognitionBadges).toEqual([
      { slug: 'premium_sponsor', publicLabel: 'Premium Sponsor' },
    ])
    expect(member).not.toHaveProperty('admin_note')
    expect(member).not.toHaveProperty('awarded_by')
  })
})
