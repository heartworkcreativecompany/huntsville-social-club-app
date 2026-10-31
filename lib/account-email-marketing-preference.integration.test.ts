import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runEmailMarketingSyncAttempt } from '@/lib/email-marketing-sync'

const exec = promisify(execFile)

type LocalEnv = {
  apiUrl: string
  anonKey: string
  dbContainer: string
}

const state: {
  env: LocalEnv | null
  memberA: string | null
  memberB: string | null
  emailA: string
} = {
  env: null,
  memberA: null,
  memberB: null,
  emailA: 'account-marketing-a@example.com',
}

function redact(message: string) {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[database-url]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
    .replace(/sb_secret_\S+/g, '[secret]')
}

async function psql(sql: string) {
  if (!state.env) throw new Error('Account preference database is not running.')
  try {
    const { stdout } = await exec(
      'docker',
      [
        'exec',
        '-i',
        state.env.dbContainer,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-t',
        '-A',
        '-c',
        sql,
      ],
      { maxBuffer: 1024 * 1024 }
    )
    return stdout.trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'psql failed'
    throw new Error(redact(message))
  }
}

async function psqlError(sql: string) {
  try {
    await psql(sql)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : 'failed'
  }
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function lastValue(output: string) {
  return (
    output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !['BEGIN', 'SET', 'COMMIT', 'ROLLBACK'].includes(line))
      .at(-1) ?? ''
  )
}

async function transactionValue(body: string) {
  return lastValue(await psql(`begin;\n${body}\ncommit;`))
}

function asMember(userId: string, statement: string) {
  return `
    select set_config('request.jwt.claims', ${sqlText(
      JSON.stringify({ sub: userId, role: 'authenticated' })
    )}, true);
    select set_config('request.jwt.claim.sub', ${sqlText(userId)}, true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    ${statement}
  `
}

function asService(statement: string) {
  return `
    select set_config('request.jwt.claims', '{"role":"service_role"}', true);
    select set_config('request.jwt.claim.role', 'service_role', true);
    set local role service_role;
    ${statement}
  `
}

async function signUp(email: string) {
  if (!state.env) throw new Error('Local Supabase is not running.')
  const response = await fetch(`${state.env.apiUrl}/signup`, {
    method: 'POST',
    headers: {
      apikey: state.env.anonKey,
      Authorization: `Bearer ${state.env.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: 'Test-password-1',
      data: {
        essential_email_acknowledgement: true,
        email_marketing_opt_in: false,
      },
    }),
  })
  const parsed = (await response.json()) as { id?: string; user?: { id?: string } }
  const userId = parsed.user?.id ?? parsed.id ?? null
  if (!response.ok || !userId) {
    throw new Error(`signup failed with status ${response.status}`)
  }
  return userId
}

async function consentLine(userId: string) {
  return psql(`
    select concat_ws('|',
      email_marketing_opt_in::text,
      (email_marketing_opted_out_at is not null)::text,
      coalesce(email_marketing_consent_source, ''),
      coalesce(email_marketing_consent_version, ''),
      essential_email_acknowledged::text,
      coalesce(essential_email_acknowledgement_source, ''),
      coalesce(essential_email_acknowledgement_version, ''),
      coalesce(full_name, ''),
      role
    )
    from public.profiles
    where id = ${sqlText(userId)}::uuid
  `)
}

async function jobLine(userId: string) {
  return psql(`
    select coalesce(string_agg(
      action || ':' || status || ':' || count::text,
      ',' order by action, status
    ), '')
    from (
      select action, status, count(*)::integer as count
      from public.email_marketing_sync
      where profile_id = ${sqlText(userId)}::uuid
      group by action, status
    ) jobs
  `)
}

describe('account email marketing preference database', () => {
  beforeAll(async () => {
    const apiUrl = process.env.SIGNUP_CONSENT_API_URL
    const anonKey = process.env.SIGNUP_CONSENT_ANON_KEY
    const dbContainer = process.env.SIGNUP_CONSENT_DB_CONTAINER
    if (!apiUrl || !anonKey || !dbContainer) {
      throw new Error(
        'Run npm run test:integration:signup-consent. It starts the isolated baseline database and Auth.'
      )
    }
    state.env = { apiUrl, anonKey, dbContainer }
    state.memberA = await signUp(state.emailA)
    state.memberB = await signUp('account-marketing-b@example.com')
  })

  afterAll(async () => {
    if (!state.env) return
    await psql(`
      delete from auth.identities
      where user_id in (
        select id from auth.users where email like 'account-marketing-%'
      );
      delete from public.email_marketing_sync
      where profile_id in (
        select id from public.profiles where email like 'account-marketing-%'
      );
      delete from public.profiles where email like 'account-marketing-%';
      delete from auth.users where email like 'account-marketing-%';
    `).catch(() => undefined)
  })

  it('keeps the functions security-definer, owned by consent_writer, and narrowly granted', async () => {
    const catalog = await psql(`
      select proname || '|' || prosecdef::text || '|' || rolname || '|' || coalesce(array_to_string(proconfig, ','), '')
      from pg_catalog.pg_proc as proc
      join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
      join pg_catalog.pg_roles as owner on owner.oid = proc.proowner
      where namespace.nspname = 'public'
        and proname in (
          'set_own_email_marketing_preference',
          'commit_email_marketing_opt_in'
        )
      order by proname
    `)
    expect(catalog).toContain('commit_email_marketing_opt_in|true|consent_writer|')
    expect(catalog).toContain('set_own_email_marketing_preference|true|consent_writer|')
    expect(catalog).toContain('search_path=')

    const privileges = await psql(`
      select concat_ws('|',
        has_function_privilege('authenticated', 'public.set_own_email_marketing_preference(boolean)', 'execute')::text,
        has_function_privilege('anon', 'public.set_own_email_marketing_preference(boolean)', 'execute')::text,
        has_function_privilege('service_role', 'public.set_own_email_marketing_preference(boolean)', 'execute')::text,
        has_function_privilege('public', 'public.set_own_email_marketing_preference(boolean)', 'execute')::text,
        has_function_privilege('authenticated', 'public.commit_email_marketing_opt_in(uuid, timestamptz)', 'execute')::text,
        has_function_privilege('anon', 'public.commit_email_marketing_opt_in(uuid, timestamptz)', 'execute')::text,
        has_function_privilege('service_role', 'public.commit_email_marketing_opt_in(uuid, timestamptz)', 'execute')::text,
        has_function_privilege('public', 'public.commit_email_marketing_opt_in(uuid, timestamptz)', 'execute')::text
      )
    `)
    expect(privileges).toBe('true|false|false|false|false|false|true|false')

    const memberBody = await psql(`
      select prosrc
      from pg_catalog.pg_proc
      join pg_catalog.pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where nspname = 'public'
        and proname = 'set_own_email_marketing_preference'
    `)
    expect(memberBody).toContain('pending_provider_confirmation')
    expect(memberBody).not.toContain('enroll')
    expect(memberBody).not.toMatch(/http|resend|dblink/i)
  })

  it('rejects signed-out and direct opt-in calls without changing consent', async () => {
    const memberA = state.memberA
    expect(memberA).toBeTruthy()
    const before = await consentLine(memberA ?? '')

    const anon = await psqlError(`
      begin;
      set local role anon;
      select public.set_own_email_marketing_preference(true);
      commit;
    `)
    const missingUser = await psqlError(`
      begin;
      set local role authenticated;
      select public.set_own_email_marketing_preference(false);
      commit;
    `)
    const directOptIn = await psqlError(`
      begin;
      ${asMember(memberA ?? '', 'select public.set_own_email_marketing_preference(true);')}
      commit;
    `)
    const invalid = await psqlError(`
      begin;
      ${asMember(
        memberA ?? '',
        'select public.set_own_email_marketing_preference(null::boolean);'
      )}
      commit;
    `)

    expect(anon).toMatch(/42501|permission denied|authentication required/i)
    expect(missingUser).toMatch(/authentication required/i)
    expect(directOptIn).toMatch(/pending_provider_confirmation/)
    expect(invalid).toMatch(/invalid marketing preference|22023/i)
    expect(await consentLine(memberA ?? '')).toBe(before)
    expect(await jobLine(memberA ?? '')).toBe('')
  })

  it('changes only the caller preference and preserves protected profile fields', async () => {
    const memberA = state.memberA ?? ''
    const memberB = state.memberB ?? ''
    await transactionValue(
      asMember(memberA, `update public.profiles set full_name = 'Kept Name' where id = auth.uid(); select full_name from public.profiles where id = auth.uid();`)
    )
    const protectedWrite = await psqlError(`
      begin;
      ${asMember(
        memberA,
        `update public.profiles
         set essential_email_acknowledged = false,
             email_marketing_opt_in = true,
             role = 'admin'
         where id = auth.uid();`
      )}
      commit;
    `)
    expect(protectedWrite).toMatch(/42501|permission denied|consent writer/i)

    const optedOut = await transactionValue(
      asMember(memberA, 'select public.set_own_email_marketing_preference(false);')
    )
    expect(optedOut).toBe('opted_out')
    expect(await consentLine(memberA)).toContain('false|true|')
    expect(await consentLine(memberA)).toContain('|true|auth_signup|')
    expect(await consentLine(memberA)).toContain('|Kept Name|member')
    expect(await jobLine(memberA)).toBe('withdraw:pending:1')
    expect(await consentLine(memberB)).toContain('false|false|')

    const crossCommit = await psqlError(`
      begin;
      ${asMember(
        memberA,
        `select public.commit_email_marketing_opt_in(${sqlText(memberB)}::uuid, pg_catalog.now());`
      )}
      commit;
    `)
    expect(crossCommit).toMatch(/42501|permission denied|forbidden/i)
    expect(await consentLine(memberB)).toContain('false|false|')

    const optedIn = await transactionValue(
      asService(
        `select public.commit_email_marketing_opt_in(${sqlText(memberA)}::uuid, pg_catalog.now());`
      )
    )
    expect(optedIn).toBe('opted_in')
    const afterFirst = await consentLine(memberA)
    expect(afterFirst.startsWith('true|false|account_preference|2026-10-07-email-marketing|')).toBe(
      true
    )
    expect(afterFirst).toContain('|true|auth_signup|')
    expect(afterFirst).toContain('|Kept Name|member')
    expect(await jobLine(memberA)).toBe('enroll:pending:1,withdraw:skipped:1')
    expect(await consentLine(memberB)).toContain('false|false|')

    const preservedAt = await psql(`
      select email_marketing_opt_in_at::text
      from public.profiles
      where id = ${sqlText(memberA)}::uuid
    `)
    const second = await transactionValue(
      asService(
        `select public.commit_email_marketing_opt_in(${sqlText(memberA)}::uuid, pg_catalog.now());`
      )
    )
    expect(second).toBe('opted_in')
    const stillAt = await psql(`
      select email_marketing_opt_in_at::text
      from public.profiles
      where id = ${sqlText(memberA)}::uuid
    `)
    expect(stillAt).toBe(preservedAt)
    expect(await jobLine(memberA)).toBe('enroll:pending:1,withdraw:skipped:1')

    const optedOutAgain = await transactionValue(
      asMember(memberA, 'select public.set_own_email_marketing_preference(false);')
    )
    expect(optedOutAgain).toBe('opted_out')
    expect((await consentLine(memberA)).startsWith('false|true|account_preference|2026-10-07-email-marketing|')).toBe(
      true
    )
    expect(await jobLine(memberA)).toBe('enroll:skipped:1,withdraw:pending:1,withdraw:skipped:1')

    const blocked = await transactionValue(
      asService(`
        select public.commit_email_marketing_opt_in(
          profile.id,
          profile.email_marketing_opted_out_at - interval '1 second'
        )
        from public.profiles as profile
        where profile.id = ${sqlText(memberA)}::uuid;
      `)
    )
    expect(blocked).toBe('blocked_resubscription')
    expect((await consentLine(memberA)).startsWith('false|true|')).toBe(true)
    expect(await jobLine(memberA)).toBe('enroll:skipped:1,withdraw:pending:1,withdraw:skipped:1')

    const resumed = await transactionValue(
      asService(
        `select public.commit_email_marketing_opt_in(${sqlText(memberA)}::uuid, pg_catalog.now() + interval '1 minute');`
      )
    )
    expect(resumed).toBe('opted_in')
    expect((await consentLine(memberA)).startsWith('true|false|account_preference|')).toBe(true)
    expect(await jobLine(memberA)).toBe('enroll:pending:1,enroll:skipped:1,withdraw:skipped:2')
    expect(await consentLine(memberB)).not.toContain('|Kept Name|member')
    expect(await consentLine(memberB)).toContain('false|false|')
    expect(await consentLine(memberA)).toContain('|Kept Name|member')
  })

  it('lets a provider unsubscribe win over a later opt-in without sending unsubscribed false', async () => {
    const memberA = state.memberA ?? ''
    await transactionValue(
      asMember(
        memberA,
        `update public.profiles set full_name = 'Kept Name' where id = auth.uid(); select full_name from public.profiles where id = auth.uid();`
      )
    )
    const prepared = await transactionValue(
      asService(
        `select public.commit_email_marketing_opt_in(${sqlText(memberA)}::uuid, pg_catalog.now());`
      )
    )
    expect(prepared).toBe('opted_in')

    const unsubscribed = await transactionValue(
      asService(
        `select public.apply_resend_contact_unsubscribe(${sqlText(state.emailA)}, 'evt-account-marketing-off');`
      )
    )
    expect(unsubscribed).toBe('applied')
    expect((await consentLine(memberA)).startsWith('false|true|')).toBe(true)

    const direct = await psqlError(`
      begin;
      ${asMember(memberA, 'select public.set_own_email_marketing_preference(true);')}
      commit;
    `)
    expect(direct).toMatch(/pending_provider_confirmation/)
    expect((await consentLine(memberA)).startsWith('false|true|')).toBe(true)

    const enrollId = await psql(`
      select id::text
      from public.email_marketing_sync
      where profile_id = ${sqlText(memberA)}::uuid
        and action = 'enroll'
        and status = 'pending'
      order by created_at desc
      limit 1
    `)
    const decision = await transactionValue(
      asService(`select decision from public.recheck_email_marketing_sync(${sqlText(enrollId)}::uuid);`)
    )
    expect(decision).toBe('skip_withdrawn')

    const raced = await transactionValue(
      asService(
        `select public.commit_email_marketing_opt_in(${sqlText(memberA)}::uuid, pg_catalog.now() + interval '1 minute');`
      )
    )
    expect(raced).toBe('opted_in')

    const sends: string[] = []
    const syncDecision = await runEmailMarketingSyncAttempt({
      action: 'enroll',
      readLocal: async () => {
        const row = await psql(`
          select concat_ws('|',
            public.profiles.email,
            public.profiles.email_marketing_opt_in::text,
            (public.profiles.email_marketing_opted_out_at is not null)::text,
            (auth.users.email_confirmed_at is not null)::text
          )
          from public.profiles
          join auth.users on auth.users.id = public.profiles.id
          where public.profiles.id = ${sqlText(memberA)}::uuid
        `)
        const [email, optIn, optedOut, confirmed] = row.split('|')
        return {
          email: email ?? null,
          emailConfirmed: confirmed === 'true',
          optIn: optIn === 'true',
          optedOutAt: optedOut === 'true' ? '2026-10-29T00:00:00.000Z' : null,
        }
      },
      lookupProvider: async () => 'unsubscribed',
      send: async (input) => {
        sends.push(input.method)
      },
      recordProviderUnsubscribe: async (email) => {
        await transactionValue(
          asService(
            `select public.apply_resend_contact_unsubscribe(${sqlText(email)}, 'evt-account-marketing-race');`
          )
        )
      },
    })

    expect(syncDecision).toBe('record_provider_unsubscribe')
    expect(sends).toEqual([])
    expect((await consentLine(memberA)).startsWith('false|true|')).toBe(true)
    expect(await consentLine(memberA)).toContain('|true|auth_signup|')
    expect(await consentLine(memberA)).toContain('|Kept Name|member')
  })
})
