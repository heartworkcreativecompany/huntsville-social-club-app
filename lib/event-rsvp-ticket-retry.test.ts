import { beforeEach, describe, expect, it, vi } from 'vitest'

const consumeEventCredit = vi.hoisted(() => vi.fn())
const sendEventTicketEmail = vi.hoisted(() => vi.fn())
const harness = vi.hoisted(() => ({
  confirmedAt: null as string | null,
  eventType: 'premium_event',
  registrationMethod: 'credit',
  paymentStatus: 'not_required' as string | null,
  creditConsumed: true,
  updates: [] as Record<string, unknown>[],
  admin: null as { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> } | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/viewer', () => ({
  getViewer: async () => ({
    userId: 'user-1',
    email: 'ada@example.com',
    role: 'member',
    applicationStatus: 'approved',
    profile: { membership_billing: null },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from(table: string) {
      if (table === 'events') {
        return {
          select() {
            return {
              eq() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 'event-1',
                        title: 'Rooftop Social',
                        starts_at: '2026-10-15T23:00:00.000Z',
                        status: 'published',
                        event_type: harness.eventType,
                        fee_cents: 2500,
                        priority_rsvp_opens_at: null,
                        general_rsvp_opens_at: null,
                        attendance_max: null,
                        rsvp_question: null,
                        rsvp_question_required: false,
                      },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'event_attendees') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return {
                          data: {
                            status: 'going',
                            registration_method: harness.registrationMethod,
                            payment_status: harness.paymentStatus,
                            entitlement_cycle_id: 'cycle-1',
                            credit_consumed: harness.creditConsumed,
                            credit_returned: false,
                            guest_name: null,
                            guest_invite_consumed: false,
                            confirmed_at: harness.confirmedAt,
                            amount_paid_cents: null,
                          },
                          error: null,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
          update(payload: Record<string, unknown>) {
            harness.updates.push(payload)
            return {
              eq() {
                return { eq: async () => ({ error: null }) }
              },
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/lib/membership-billing-cycles', () => ({
  loadActiveEntitlementCycle: async () => ({ id: 'cycle-1' }),
  consumeEventCredit,
  consumeCircleSocialCredit: vi.fn(),
  appendRegistrationLedger: vi.fn(),
  returnEventCredit: vi.fn(),
  returnCircleSocialCredit: vi.fn(),
  returnGuestInvite: vi.fn(),
}))
vi.mock('@/lib/load-member-entitlements', () => ({
  buildMemberEntitlementsWithOverride: async () => ({
    productTier: 'inner_circle',
    billingProductTier: 'inner_circle',
    premiumCreditsRemaining: 1,
    circleSocialCreditsRemaining: 0,
    guestInvitesRemaining: 0,
    subscriptionActive: true,
    benefitFulfillment: 'issued',
    activeCycle: {
      id: 'cycle-1',
      credits_granted: 2,
      circle_social_credits_granted: 0,
      guest_invites_granted: 0,
      period_start: '2026-11-01',
      period_end: '2026-12-01',
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => harness.admin,
}))
vi.mock('@/lib/transactional-email', () => ({ sendEventTicketEmail }))

import { updateEventRsvp } from '@/app/(club)/events/rsvp-actions'

describe('already Going ticket confirmation', () => {
  beforeEach(() => {
    consumeEventCredit.mockReset()
    sendEventTicketEmail.mockReset()
    sendEventTicketEmail.mockResolvedValue({ sent: true, id: 're_ticket_1' })
    harness.confirmedAt = null
    harness.eventType = 'premium_event'
    harness.registrationMethod = 'credit'
    harness.paymentStatus = 'not_required'
    harness.creditConsumed = true
    harness.updates = []
    harness.admin = null
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('confirms an unconfirmed credit RSVP on the next Going tap without another credit', async () => {
    const memory = createConfirmMailbox()
    harness.admin = memory.admin

    const result = await updateEventRsvp({ eventId: 'event-1', status: 'going' })

    expect(result).toMatchObject({ success: true, usedCredit: false })
    expect(consumeEventCredit).not.toHaveBeenCalled()
    expect(harness.updates[0]).not.toHaveProperty('payment_status')
    expect(harness.updates[0]).not.toHaveProperty('credit_consumed')
    expect(memory.snapshot().confirmArgs).toMatchObject({
      p_admission_source: 'premium_event_credit',
      p_amount_paid_cents: 0,
      p_payment_status: 'not_required',
      p_credits_remaining: 1,
    })
    expect(sendEventTicketEmail).toHaveBeenCalledTimes(1)
    expect(sendEventTicketEmail.mock.calls[0]?.[0]).toMatchObject({
      admissionSource: 'premium_event_credit',
      creditsRemaining: 1,
      confirmationCode: 'AB23CD45',
      outboxId: 'outbox-1',
    })
    expect(memory.snapshot().codes).toBe(1)
  })

  it.each([
    {
      name: 'included',
      eventType: 'premium_event',
      source: 'included',
    },
    {
      name: 'free',
      eventType: 'standard_event',
      source: 'free',
    },
  ])('confirms an unconfirmed $name RSVP on the next Going tap', async ({ eventType, source }) => {
    harness.eventType = eventType
    harness.registrationMethod = 'included_unlimited'
    harness.creditConsumed = false
    const memory = createConfirmMailbox()
    harness.admin = memory.admin

    const result = await updateEventRsvp({ eventId: 'event-1', status: 'going' })

    expect(result).toMatchObject({ success: true, usedCredit: false })
    expect(consumeEventCredit).not.toHaveBeenCalled()
    expect(memory.snapshot().confirmArgs).toMatchObject({
      p_admission_source: source,
      p_amount_paid_cents: 0,
      p_payment_status: 'not_required',
    })
    expect(sendEventTicketEmail).toHaveBeenCalledTimes(1)
    expect(sendEventTicketEmail.mock.calls[0]?.[0]).toMatchObject({
      admissionSource: source,
      outboxId: 'outbox-1',
    })
  })

  it('does not confirm an unconfirmed paid RSVP on a Going tap', async () => {
    harness.registrationMethod = 'paid_per_event'
    harness.paymentStatus = 'paid'
    harness.creditConsumed = false
    harness.admin = {
      rpc: vi.fn(async () => {
        throw new Error('confirm should not run')
      }),
    }

    const result = await updateEventRsvp({ eventId: 'event-1', status: 'going' })

    expect(result).toMatchObject({ success: true, usedCredit: false })
    expect(consumeEventCredit).not.toHaveBeenCalled()
    expect(sendEventTicketEmail).not.toHaveBeenCalled()
    expect(harness.admin.rpc).not.toHaveBeenCalled()
  })

  it('sends no email when the Going RSVP is already confirmed', async () => {
    harness.confirmedAt = '2026-11-06T18:00:00.000Z'
    harness.admin = {
      rpc: vi.fn(async () => {
        throw new Error('confirm should not run')
      }),
    }

    const result = await updateEventRsvp({ eventId: 'event-1', status: 'going' })

    expect(result).toMatchObject({ success: true })
    expect(consumeEventCredit).not.toHaveBeenCalled()
    expect(sendEventTicketEmail).not.toHaveBeenCalled()
    expect(harness.admin.rpc).not.toHaveBeenCalled()
  })

  it('keeps the RSVP when confirmation fails', async () => {
    harness.admin = {
      rpc: async () => ({ data: { ok: false, error: 'confirm_failed' }, error: null }),
    }

    const result = await updateEventRsvp({ eventId: 'event-1', status: 'going' })

    expect(result).toMatchObject({ success: true, usedCredit: false })
    expect(consumeEventCredit).not.toHaveBeenCalled()
    expect(sendEventTicketEmail).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('[event_ticket_email]', 'ticket_confirm_failed')
  })
})

function createConfirmMailbox() {
  let codes = 0
  let outboxClaimed = false
  let confirmArgs: Record<string, unknown> | null = null
  const admin = {
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'confirm_event_admission') {
        codes += 1
        confirmArgs = args
        return {
          data: {
            ok: true,
            already_confirmed: false,
            confirmation_code: 'AB23CD45',
            outbox_id: 'outbox-1',
            registration_id: 'attendee-1',
          },
          error: null,
        }
      }
      if (fn === 'claim_event_ticket_email') {
        if (outboxClaimed) return { data: { row: null }, error: null }
        outboxClaimed = true
        return { data: { row: { claim_token: 'token-1' } }, error: null }
      }
      if (fn === 'load_event_ticket_email_context') {
        if (args.p_claim_token !== 'token-1') return { data: { context: null }, error: null }
        return {
          data: {
            context: {
              to: 'ada@example.com',
              attendee_name: 'Ada Lovelace',
              event_name: 'Rooftop Social',
              starts_at: '2026-10-15T23:00:00.000Z',
              ends_at: null,
              venue: 'Lipz Lounge',
              confirmation_code: 'AB23CD45',
              admission_source: confirmArgs?.p_admission_source,
              amount_paid_cents: 0,
              credits_remaining:
                typeof confirmArgs?.p_credits_remaining === 'number'
                  ? confirmArgs.p_credits_remaining
                  : null,
            },
          },
          error: null,
        }
      }
      if (fn === 'finish_event_ticket_email') {
        return { data: { ok: true }, error: null }
      }
      return { data: null, error: { message: fn } }
    },
  }
  return { admin, snapshot: () => ({ codes, confirmArgs }) }
}
