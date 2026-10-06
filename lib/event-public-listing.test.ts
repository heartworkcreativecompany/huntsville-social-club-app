import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveListedPublicly,
  isPublicListingManager,
} from '@/lib/event-public-listing'

const repoRoot = process.cwd()

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

const MIGRATION = '20261005000000_events_listed_publicly.sql'
const sql = readRepoFile(`supabase/migrations/${MIGRATION}`)

const PUBLIC_EVENT_COLUMNS = [
  'id',
  'title',
  'description',
  'location',
  'starts_at',
  'ends_at',
  'event_type',
  'fee_cents',
  'attendance_max',
  'cover_image_url',
] as const

const HIDDEN_EVENT_COLUMNS = [
  'owner_id',
  'rsvp_question',
  'rsvp_question_required',
  'visibility',
  'sponsorship_eligible',
  'priority_rsvp_opens_at',
  'general_rsvp_opens_at',
  'status',
  'listed_publicly',
  'created_at',
  'updated_at',
] as const

const CLOSED_TABLES = [
  'event_attendees',
  'event_rsvp_pending_answers',
  'event_registration_ledger',
  'membership_entitlement_cycles',
  'member_profiles',
  'event_sponsorships',
  'sponsors',
  'event_sponsors',
] as const

function grantColumns(source: string): string[] {
  const match = source.match(
    /grant select\s*\(([^)]+)\)\s*on table public\.events to anon/i
  )
  if (!match) return []
  return match[1]
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
}

describe('listed_publicly defaults and role rules', () => {
  it('defaults new events to unlisted', () => {
    expect(sql).toMatch(
      /add column if not exists listed_publicly boolean not null default false/i
    )
    expect(resolveListedPublicly({ role: 'host', requested: undefined })).toBe(
      false
    )
    expect(resolveListedPublicly({ role: 'admin', requested: false })).toBe(
      false
    )
    expect(resolveListedPublicly({ role: 'admin', requested: null })).toBe(
      false
    )
    expect(resolveListedPublicly({ role: 'member' })).toBe(false)
  })

  it('lets hosts and admins turn public listing on and off', () => {
    expect(isPublicListingManager('host')).toBe(true)
    expect(isPublicListingManager('admin')).toBe(true)
    expect(resolveListedPublicly({ role: 'host', requested: true })).toBe(true)
    expect(resolveListedPublicly({ role: 'host', requested: false })).toBe(
      false
    )
    expect(resolveListedPublicly({ role: 'admin', requested: true })).toBe(
      true
    )
    expect(resolveListedPublicly({ role: 'admin', requested: false })).toBe(
      false
    )
  })

  it('forces false for a regular member even when the field is sent true', () => {
    expect(isPublicListingManager('member')).toBe(false)
    expect(isPublicListingManager('connect')).toBe(false)
    expect(isPublicListingManager(null)).toBe(false)
    expect(resolveListedPublicly({ role: 'member', requested: true })).toBe(
      false
    )
    expect(resolveListedPublicly({ role: 'connect', requested: true })).toBe(
      false
    )
    expect(resolveListedPublicly({ role: null, requested: true })).toBe(false)
  })
})

describe('anonymous event read migration', () => {
  it('lets anon select only published events that are listed publicly', () => {
    const policy = sql.slice(
      sql.indexOf('create policy'),
      sql.indexOf('create or replace function')
    )
    expect(policy).toContain(
      'Anonymous users can read publicly listed published events'
    )
    expect(policy).toMatch(/for select\s+to anon/i)
    expect(policy).toMatch(/status = 'published'/i)
    expect(policy).toMatch(/listed_publicly = true/i)
    expect(policy).not.toMatch(/to authenticated/i)
    expect(policy).not.toMatch(/to public\b/i)
    expect(sql).not.toMatch(/drop policy/i)
  })

  it('grants anon only the safe event columns', () => {
    expect(sql).toMatch(/revoke select on table public\.events from anon/i)
    expect(grantColumns(sql)).toEqual([...PUBLIC_EVENT_COLUMNS])
    for (const column of HIDDEN_EVENT_COLUMNS) {
      expect(grantColumns(sql)).not.toContain(column)
    }
    expect(sql).not.toMatch(
      /grant select on table public\.events to anon/i
    )
  })

  it('does not open attendee, profile, ledger, credit, or sponsor tables to anon', () => {
    for (const table of CLOSED_TABLES) {
      expect(sql).not.toContain(`public.${table}`)
      expect(sql).not.toMatch(
        new RegExp(`\\bon\\s+(?:table\\s+)?(?:public\\.)?${table}\\b`, 'i')
      )
    }
    const anonGrants = sql.match(/grant select[\s\S]*?to anon/gi) ?? []
    expect(anonGrants).toHaveLength(1)
    expect(anonGrants[0]).toContain('public.events')
  })

  it('forces listed_publicly false unless the writer is a host or admin', () => {
    expect(sql).toContain('events_enforce_public_listing')
    expect(sql).toContain('public.is_host_or_admin(auth.uid())')
    expect(sql).toContain('new.listed_publicly := false')
    expect(sql).toMatch(
      /before insert or update on public\.events/i
    )
  })
})

describe('event save path uses the server rule', () => {
  it('writes resolveListedPublicly and never the raw client flag', () => {
    const actions = readRepoFile('app/(club)/events/actions.ts')
    expect(actions).toContain('resolveListedPublicly')
    expect(actions).not.toContain('listed_publicly: input.listedPublicly')
    expect(actions.match(/resolveListedPublicly\(/g)?.length).toBe(2)

    const createForm = readRepoFile('app/(club)/events/event-form.tsx')
    const editForm = readRepoFile('app/(club)/events/event-edit-form.tsx')
    expect(createForm).toContain('Show on public calendar')
    expect(createForm).toContain('isAdminCreator')
    expect(editForm).toContain('Show on public calendar')
    expect(editForm).toContain('canListPublicly')
  })
})
