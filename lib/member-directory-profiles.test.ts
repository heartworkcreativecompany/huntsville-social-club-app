import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APPLICATION_PROMPTS } from '@/lib/application-form-content'
import { publicProfileDetailsFromDraft } from '@/lib/profile-public-display'
import { emptyDraft, parseApplicationDraft } from '@/lib/application'
import {
  MEMBER_DIRECTORY_PROFILE_COLUMNS,
  prepareSafeDirectoryRow,
} from '@/lib/member-directory-profiles'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'supabase/migrations/20261112010000_member_profile_privacy.sql'),
  'utf8'
)

const FORBIDDEN_COLUMNS = [
  'email',
  'verified_phone_e164',
  'phone_verified_at',
  'sms_marketing_opt_in',
  'sms_marketing_opt_in_at',
  'sms_marketing_consent_version',
  'sms_marketing_consent_source',
  'sms_marketing_consent_phone_e164',
  'sms_marketing_opted_out_at',
  'identity_verification_status',
  'identity_verification_session_id',
  'identity_verified_at',
  'identity_verification_last_error',
  'membership_billing',
  'application_draft',
  'admin_review_notes',
  'profile_revision_admin_notes',
  'profile_revision_history',
  'messaging_suspended_at',
  'messaging_suspension_reason',
  'messaging_suspended_by',
  'approval_gates',
  'verification_state',
  'premium_verification',
  'compatibility_questionnaire',
  'location_zip',
  'birth_year',
] as const

function viewSelectSql(): string {
  const start = migration.indexOf('create view public.member_directory_profiles')
  const from = migration.indexOf('from public.profiles p', start)
  return migration.slice(start, from)
}

describe('member directory profile columns', () => {
  it('allows only the public columns other members display', () => {
    for (const column of FORBIDDEN_COLUMNS) {
      expect(MEMBER_DIRECTORY_PROFILE_COLUMNS).not.toContain(column)
    }
  })

  it('matches the columns selected by the safe view', () => {
    const view = viewSelectSql()
    const selected = new Set<string>()
    for (const match of view.matchAll(/\bas ([a-z_]+)/g)) {
      selected.add(match[1]!)
    }
    for (const match of view.matchAll(/\bp\.([a-z_]+)/g)) {
      const column = match[1]!
      if (column === 'application_draft' || column === 'verification_state') continue
      selected.add(column)
    }
    expect([...selected].sort()).toEqual([...MEMBER_DIRECTORY_PROFILE_COLUMNS].sort())
  })

  it('does not project private columns from profiles', () => {
    const view = viewSelectSql()
    for (const column of FORBIDDEN_COLUMNS) {
      if (column === 'application_draft' || column === 'verification_state') continue
      expect(view).not.toMatch(new RegExp(`\\bp\\.${column}\\b`))
      expect(view).not.toMatch(new RegExp(`\\bas ${column}\\b`))
    }
    expect(view).not.toMatch(/\bas application_draft\b/)
    expect(view).not.toMatch(/\bas verification_state\b/)
  })

  it('returns contact email only when the member chose to show it', () => {
    expect(migration).toContain('when p.show_contact_email then p.contact_email')
    expect(migration).toContain('else null')
  })

  it('keeps a public profile slice from leaking private draft answers', () => {
    const row = prepareSafeDirectoryRow({
      public_profile: {
        version: 2,
        profile: { aboutMe: 'Hello', dateOfBirth: '' },
      },
      profile_checks_approved: true,
    })
    expect(row.application_draft).toEqual({
      version: 2,
      profile: { aboutMe: 'Hello', dateOfBirth: '' },
    })
    expect(row.verification_state).toEqual({
      email: 'approved',
      phone: 'approved',
      profile_reviewed: 'approved',
      photo_reviewed: 'approved',
      locality: 'approved',
    })
    const hidden = prepareSafeDirectoryRow({ profile_checks_approved: false })
    expect(hidden.application_draft).toBeNull()
    expect(hidden.verification_state).toEqual({})
  })
})

describe('profile privacy migration', () => {
  it('drops the approved-profile select policy and keeps a definer read path', () => {
    expect(migration).toContain(
      'drop policy if exists "Members can view approved profiles" on public.profiles'
    )
    expect(migration).not.toContain('create policy "Members can view approved profiles"')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path = public')
    expect(migration).toContain('security_invoker = false')
    expect(migration).toContain('security_barrier = true')
    expect(migration).toContain("p.application_status = 'approved'")
    expect(migration).toContain('p.removed_at is null')
    expect(migration).toContain('viewer.id = (select auth.uid())')
    expect(migration).toContain("viewer.application_status = 'approved'")
    expect(migration).toContain("viewer.role = any (array['admin'::text, 'host'::text])")
    expect(migration).toContain('viewer.removed_at is null')
    expect(migration).toContain('security invoker')
    expect(migration).toContain('is_approved_active_member')
    expect(migration).toContain('public.is_approved_active_member(vouchee_id)')
    expect(migration).toContain('voucher.removed_at is null')
    expect(migration).toContain('viewer_profile.removed_at is null')
    expect(migration).toContain(
      'drop policy if exists "Approved members read approved member photos" on storage.objects'
    )
    expect(migration).toContain(
      'revoke all on public.member_directory_profiles from anon'
    )
    expect(migration).toContain(
      'grant select on public.member_directory_profiles to authenticated'
    )
    expect(migration).not.toContain(
      'grant select on public.member_directory_profiles to anon'
    )
  })

  it('has no anon policy on profiles', () => {
    const migrationsDir = join(root, 'supabase/migrations')
    const anonPolicies: string[] = []
    for (const file of readdirSync(migrationsDir)) {
      if (!file.endsWith('.sql')) continue
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      const blocks = sql.split(/create policy/i).slice(1)
      for (const block of blocks) {
        const head = block.slice(0, 400)
        if (/on\s+(?:"public"\.)?"?profiles"?/i.test(head) && /\bto anon\b/i.test(head)) {
          anonPolicies.push(file)
        }
      }
    }
    expect(anonPolicies).toEqual([])
  })

  it('ships a rolled-back session check for vouches, photos, hosts, and anon', () => {
    const check = readFileSync(join(root, 'scripts/profile-privacy-check.sql'), 'utf8')
    expect(check).toContain('pg_policies')
    expect(check).toContain('member_directory_profiles')
    expect(check).toContain('set local role anon')
    expect(check).toContain('insert into public.member_vouches')
    expect(check).toContain('storage.objects')
    expect(check).toContain("role = 'host'")
    expect(check).toContain('set removed_at = now()')
    expect(check).toContain('removed viewer vouch was allowed')
    expect(check).toContain('removed viewer photo read was allowed')
    expect(check).toContain('rollback')
    expect(check.toLowerCase()).not.toContain('commit;')
  })
})

describe('public application slice', () => {
  it('blanks internal review prompts and keeps the icebreaker fallback', () => {
    const slice = migration.slice(
      migration.indexOf('create or replace function public.member_public_profile'),
      migration.indexOf('comment on function public.member_public_profile')
    )
    expect(slice).toContain("'bringsYouHere', ''")
    expect(slice).toContain("'hopingToMeet', ''")
    expect(slice).toContain("draft #>> '{prompts,icebreaker}'")
    expect(slice).toContain("draft #>> '{prompts,intoLately}'")
    expect(slice).toContain('security invoker')
    expect(slice).not.toContain('security definer')

    const internal = APPLICATION_PROMPTS.filter((prompt) => !prompt.profileVisible)
    expect(internal.map((prompt) => prompt.key)).toEqual([
      'bringsYouHere',
      'hopingToMeet',
    ])

    const parsed = parseApplicationDraft({
      version: 2,
      prompts: {
        icebreaker: '   ',
        intoLately: 'Legacy icebreaker',
      },
    })
    expect(parsed.prompts.icebreaker).toBe('Legacy icebreaker')
    const kept = parseApplicationDraft({
      version: 2,
      prompts: {
        icebreaker: 'Current icebreaker',
        intoLately: 'Legacy icebreaker',
      },
    })
    expect(kept.prompts.icebreaker).toBe('Current icebreaker')

    const draft = emptyDraft()
    draft.prompts.bringsYouHere = 'SECRET_BRINGS_YOU_HERE'
    draft.prompts.hopingToMeet = 'SECRET_HOPING_TO_MEET'
    draft.prompts.icebreaker = 'Legacy icebreaker'
    draft.prompts.perfectWeekend = 'Farmers market'
    const details = publicProfileDetailsFromDraft(draft)
    expect(details.prompts.map((prompt) => prompt.value)).toEqual([
      'Farmers market',
      'Legacy icebreaker',
    ])
    expect(JSON.stringify(details)).not.toContain('SECRET_BRINGS_YOU_HERE')
    expect(JSON.stringify(details)).not.toContain('SECRET_HOPING_TO_MEET')
  })
})

describe('other-member reads use the safe path', () => {
  function source(path: string): string {
    return readFileSync(join(root, path), 'utf8')
  }

  it('loads the directory and another member profile from the safe view', () => {
    const directory = source('lib/load-directory-profiles.ts')
    expect(directory).toContain('MEMBER_DIRECTORY_PROFILES')
    expect(directory).toContain('prepareSafeDirectoryRow')
    expect(directory).toContain(".is('removed_at', null)")
    const otherMember = directory.slice(directory.indexOf('const fullRow = isAdmin || isSelf'))
    expect(otherMember).toContain('MEMBER_DIRECTORY_PROFILE_FIELDS')
    expect(otherMember).toContain('prepareSafeDirectoryRow')
  })

  it('loads match cards, messages, and event names without private profile columns', () => {
    const curated = source('lib/load-curated-matches.ts')
    expect(curated).toContain(".from(MEMBER_DIRECTORY_PROFILES)")
    expect(curated).toContain('public_profile')
    expect(curated).not.toContain('application_draft,')
    expect(curated).not.toContain('compatibility_questionnaire')

    const friends = source('lib/friendship/load-matches.ts')
    expect(friends).toContain(".from(MEMBER_DIRECTORY_PROFILES)")
    expect(friends).toContain('public_profile')
    expect(friends).not.toContain("'id, full_name, location_area, application_draft'")

    const messages = source('lib/member-messages.ts')
    expect(messages).toContain(".from(MEMBER_DIRECTORY_PROFILES)")
    expect(messages).toContain(".select('id, full_name')")
    expect(messages).not.toContain('email')

    const event = source('app/(club)/events/[id]/page.tsx')
    expect(event).toContain('MEMBER_DIRECTORY_PROFILES')
    expect(event).toContain(".select('id, full_name')")
    expect(event).toContain('memberFacingAttendeeRows')

    const pool = source('lib/compatibility/match-candidate-pool.ts')
    const poolBody = pool.slice(pool.indexOf('export async function loadMatchPoolProfiles'))
    expect(poolBody.indexOf('createAdminClient()')).toBeGreaterThan(-1)
    expect(poolBody.indexOf('createAdminClient()')).toBeLessThan(
      poolBody.indexOf('.select(MATCH_POOL_SELECT)')
    )
  })
})
