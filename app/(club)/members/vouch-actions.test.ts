import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const VOUCHEE_ID = '22222222-2222-4222-8222-222222222222'
const VOUCH_ID = '33333333-3333-4333-8333-333333333333'

const { update, revalidatePath, state } = vi.hoisted(() => ({
  update: vi.fn(),
  revalidatePath: vi.fn(),
  state: {
    status: 'rejected',
    note: 'They are kind.',
    moderationReason: 'Withdrawn by member.',
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } } }),
    },
    from: (table: string) => {
      if (table === 'member_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { application_status: 'approved' },
                error: null,
              }),
            }),
          }),
        }
      }

      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                vouchee_id: VOUCHEE_ID,
                voucher_id: USER_ID,
                note: state.note,
                status: state.status,
                moderation_reason: state.moderationReason,
              },
              error: null,
            }),
          }),
        }),
        update: (payload: unknown) => {
          update(payload)
          return {
            eq: async () => ({ error: null }),
          }
        },
      }
    },
  }),
}))

import { updateMemberVouchEndorsement } from '@/app/(club)/members/vouch-actions'

describe('updateMemberVouchEndorsement', () => {
  beforeEach(() => {
    update.mockReset()
    revalidatePath.mockReset()
    state.status = 'rejected'
    state.note = 'They are kind.'
    state.moderationReason = 'Withdrawn by member.'
  })

  it.each([
    {
      label: 'withdrawn',
      previousReason: 'Withdrawn by member.',
    },
    {
      label: 'rejected',
      previousReason: 'Does not meet the community standard.',
    },
  ])(
    'resubmitting a $label vouch sets status to pending and clears moderation_reason',
    async ({ previousReason }) => {
      state.status = 'rejected'
      state.moderationReason = previousReason
      const result = await updateMemberVouchEndorsement({
        vouchId: VOUCH_ID,
        note: 'They show up for people.',
      })

      expect(result).toEqual({ success: true })
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          moderation_reason: null,
        })
      )
    }
  )
})
