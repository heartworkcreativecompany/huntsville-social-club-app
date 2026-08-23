import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { logModerationAction, uuidOrNull } from '@/lib/moderation-actions'
import { RECOGNITION_BADGE_SLUGS } from '@/lib/recognition-badges/catalog'

type InsertCall = Record<string, unknown>

function createInsertClient(inserts: InsertCall[], error: { message: string } | null = null) {
  return {
    from(table: string) {
      expect(table).toBe('moderation_actions')
      const query: Record<string, unknown> = {}
      query.insert = (payload: InsertCall) => {
        inserts.push(payload)
        return query
      }
      query.then = (resolve: (value: { data: null; error: { message: string } | null }) => unknown) =>
        Promise.resolve({ data: null, error }).then(resolve)
      return query
    },
  } as unknown as SupabaseClient<Database>
}

describe('moderation audit uuid fields', () => {
  it('never writes a badge slug into source_id', async () => {
    const inserts: InsertCall[] = []
    const client = createInsertClient(inserts)

    const result = await logModerationAction(client, {
      actorId: '22222222-2222-4222-8222-222222222222',
      targetMemberId: '11111111-1111-4111-8111-111111111111',
      actionType: 'recognition_badge_awarded',
      sourceType: 'recognition_badge',
      sourceId: 'founding_member',
      details: JSON.stringify({ slug: 'founding_member' }),
    })

    expect(result).toEqual({ ok: true })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]?.source_id).toBeNull()
    expect(inserts[0]?.target_member_id).toBe(
      '11111111-1111-4111-8111-111111111111'
    )
    expect(String(inserts[0]?.details)).toContain('founding_member')
    for (const slug of RECOGNITION_BADGE_SLUGS) {
      expect(uuidOrNull(slug)).toBeNull()
      expect(inserts[0]?.source_id).not.toBe(slug)
      expect(inserts[0]?.target_member_id).not.toBe(slug)
      expect(inserts[0]?.actor_id).not.toBe(slug)
    }
  })
})
