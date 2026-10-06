import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION = '20261005210000_guest_event_registrations.sql'
const sql = readFileSync(
  resolve(process.cwd(), `supabase/migrations/${MIGRATION}`),
  'utf8'
)
const types = readFileSync(
  resolve(process.cwd(), 'lib/database.types.ts'),
  'utf8'
)

const UNTOUCHED_TABLES = [
  'event_attendees',
  'membership_entitlement_cycles',
  'event_registration_ledger',
  'event_rsvp_pending_answers',
] as const

function policySql(): string {
  const start = sql.indexOf('create policy')
  const end = sql.indexOf('revoke all')
  return sql.slice(start, end)
}

describe('guest event registrations table', () => {
  it('stores paid guest RSVPs separately from member attendance', () => {
    expect(sql).toContain('create table public.guest_event_registrations')
    expect(sql).toContain('id uuid primary key default gen_random_uuid()')
    expect(sql).toContain(
      'event_id uuid not null references public.events (id) on delete cascade'
    )
    expect(sql).toContain("status text not null default 'pending_payment'")
    expect(sql).toContain("currency text not null default 'usd'")
    expect(sql).toContain('stripe_checkout_session_id text unique')
    expect(sql).toContain('expires_at timestamptz')
    expect(sql).toContain('paid_at timestamptz')
    expect(sql).toMatch(/char_length\(full_name\) between 1 and 120/)
    expect(sql).toMatch(/char_length\(rsvp_answer\) <= 300/)
    expect(sql).toContain('execute function public.set_updated_at()')
    expect(sql).not.toMatch(/create or replace function/i)
  })

  it('requires a positive amount and a lowercase trimmed email', () => {
    expect(sql).toMatch(/check \(amount_cents > 0\)/)
    expect(sql).not.toMatch(/amount_cents >= 0/)
    expect(sql).toMatch(/check \(email = lower\(trim\(email\)\)\)/)
  })

  it('allows one active registration per email and event', () => {
    expect(sql).toMatch(
      /create index guest_event_registrations_event_id_idx\s+on public\.guest_event_registrations \(event_id\)/
    )
    expect(sql).toMatch(
      /create unique index guest_event_registrations_one_active_email_per_event\s+on public\.guest_event_registrations \(event_id, email\)\s+where status in \('pending_payment', 'paid'\)/
    )
    const uniqueIndex = sql.slice(
      sql.indexOf('guest_event_registrations_one_active_email_per_event')
    )
    expect(uniqueIndex).not.toMatch(
      /where status in \([^)]*'cancelled'|'expired'|'refunded'/
    )
  })

  it('lets only admins and the event owner select', () => {
    const policy = policySql()
    expect(policy).toContain(
      'Admins and event owners can read guest registrations'
    )
    expect(policy).toMatch(/for select\s+to authenticated/i)
    expect(policy).toContain('public.is_admin((select auth.uid()))')
    expect(policy).toContain('events.owner_id = (select auth.uid())')
    expect(policy).not.toMatch(/for insert|for update|for delete/i)
    expect(policy).not.toMatch(/to anon|to public\b/i)
    expect(sql).not.toMatch(
      /create policy[\s\S]*for (insert|update|delete)/i
    )
  })

  it('revokes writes from anon and authenticated', () => {
    expect(sql).toMatch(
      /revoke all on table public\.guest_event_registrations from anon, authenticated/i
    )
    expect(sql).toMatch(
      /grant select on table public\.guest_event_registrations to authenticated/i
    )
    expect(sql).not.toMatch(
      /grant (insert|update|delete|all)[\s\S]*to authenticated/i
    )
    expect(sql).not.toMatch(/grant [\s\S]*to anon/i)
    expect(sql).toMatch(
      /grant all on table public\.guest_event_registrations to service_role/i
    )
  })

  it('does not change member attendance, credits, or entitlements', () => {
    for (const table of UNTOUCHED_TABLES) {
      expect(sql).not.toMatch(
        new RegExp(
          `(alter|drop|create|grant|revoke|update|insert into|delete from)[\\s\\S]{0,80}\\b${table}\\b`,
          'i'
        )
      )
    }
    expect(sql).not.toMatch(/alter table public\.events\b/i)
    expect(sql).not.toMatch(
      /drop policy[\s\S]{0,200}on public\.(events|event_attendees|membership_entitlement_cycles|event_registration_ledger)\b/i
    )
    expect(sql).not.toMatch(/create or replace function public\.(is_admin|set_updated_at)/i)
  })
})

describe('guest registration database types', () => {
  it('adds only the guest registration columns', () => {
    const start = types.indexOf('guest_event_registrations:')
    const block = types.slice(start, types.indexOf('event_sponsorships:', start))
    expect(block).toContain('amount_cents: number')
    expect(block).toContain('email: string')
    expect(block).toContain('rsvp_answer: string | null')
    expect(block).toContain('stripe_checkout_session_id: string | null')
    expect(block).not.toContain('credit_consumed')
    expect(block).not.toContain('entitlement_cycle_id')
  })
})
