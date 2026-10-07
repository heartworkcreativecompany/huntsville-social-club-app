import { execFile } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  nextMarketingSyncDelaySeconds,
  runEmailMarketingSyncAttempt,
} from '@/lib/email-marketing-sync'
import {
  handleResendContactWebhook,
  type ResubscribeReconciliation,
} from '@/lib/resend-contact-webhook'

const exec = promisify(execFile)

type LocalEnv = {
  apiUrl: string
  anonKey: string
  dbContainer: string
}

const state: {
  env: LocalEnv | null
  essentialUserId: string | null
  marketingUserId: string | null
} = {
  env: null,
  essentialUserId: null,
  marketingUserId: null,
}

function redact(message: string) {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[database-url]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
    .replace(/sb_secret_\S+/g, '[secret]')
}

async function psql(sql: string) {
  if (!state.env) throw new Error('Signup consent integration database is not running.')
  const args = ['-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql]
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
        ...args,
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

async function authRequest(
  path: string,
  body: Record<string, unknown>
) {
  if (!state.env) throw new Error('Local Supabase is not running.')
  const response = await fetch(`${state.env.apiUrl}${path}`, {
    method: 'POST',
    headers: {
      apikey: state.env.anonKey,
      Authorization: `Bearer ${state.env.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const raw = await response.text()
  let message = ''
  let userId: string | null = null
  let hasSession = false
  try {
    const parsed = JSON.parse(raw) as {
      msg?: string
      message?: string
      error_description?: string
      error?: string
      access_token?: string
      user?: { id?: string }
      id?: string
    }
    message =
      parsed.msg ||
      parsed.message ||
      parsed.error_description ||
      (typeof parsed.error === 'string' ? parsed.error : '') ||
      ''
    userId = parsed.user?.id ?? parsed.id ?? null
    hasSession = Boolean(parsed.access_token)
  } catch {
    message = 'unparsed auth response'
  }
  return { status: response.status, message, userId, hasSession }
}

async function signUp(email: string, data?: Record<string, unknown>) {
  return authRequest('/signup', {
    email,
    password: 'Test-password-1',
    data: data ?? {},
  })
}

describe('local signup email consent', () => {
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
  })

  afterAll(async () => {
    if (!state.env) return
    await psql(`
      delete from auth.identities
      where user_id in (
        select id from auth.users where email like 'signup-consent-%'
      );
      delete from public.email_marketing_sync
      where profile_id in (
        select id from public.profiles where email like 'signup-consent-%'
      );
      delete from public.profiles where email like 'signup-consent-%';
      delete from auth.users where email like 'signup-consent-%';
    `).catch(() => undefined)
  })

  it('rejects omitted, false, and string essential acknowledgement with no auth user or profile', async () => {
    const cases = [
      ['signup-consent-omitted@example.com', {}],
      ['signup-consent-false@example.com', { essential_email_acknowledgement: false }],
      [
        'signup-consent-string@example.com',
        { essential_email_acknowledgement: 'true' },
      ],
    ] as const

    for (const [email, data] of cases) {
      const result = await signUp(email, data)
      expect(result.status).toBeGreaterThanOrEqual(400)
      expect(result.hasSession).toBe(false)
      expect(result.message).toMatch(/essential email acknowledgement/i)
      const users = await psql(
        `select count(*) from auth.users where email = ${sqlText(email)}`
      )
      const profiles = await psql(
        `select count(*) from public.profiles where email = ${sqlText(email)}`
      )
      expect(users).toBe('0')
      expect(profiles).toBe('0')
    }
  })

  it('stores database evidence for essential acknowledgement without marketing or client fields', async () => {
    const email = 'signup-consent-essential@example.com'
    const result = await signUp(email, {
      essential_email_acknowledgement: true,
      email_marketing_opt_in: false,
      essential_email_acknowledgement_source: 'client',
      essential_email_acknowledged_at: '2000-01-01T00:00:00.000Z',
      essential_email_acknowledgement_version: 'client-version',
    })
    expect(result.status).toBeLessThan(400)
    expect(result.userId).toBeTruthy()
    state.essentialUserId = result.userId

    const row = await psql(`
      select essential_email_acknowledged::text
        || '|' || essential_email_acknowledgement_source
        || '|' || essential_email_acknowledgement_version
        || '|' || email_marketing_opt_in::text
        || '|' || coalesce(email_marketing_consent_source, '')
        || '|' || coalesce(email_marketing_consent_version, '')
        || '|' || (essential_email_acknowledged_at > '2026-01-01'::timestamptz)::text
        || '|' || (essential_email_acknowledged_at = '2000-01-01T00:00:00.000Z'::timestamptz)::text
      from public.profiles
      where email = ${sqlText(email)}
    `)
    expect(row).toBe(
      'true|auth_signup|2026-10-07-essential-email|false|||true|false'
    )
  })

  it('records marketing evidence separately and still lets that account sign in', async () => {
    const email = 'signup-consent-marketing@example.com'
    const created = await signUp(email, {
      essential_email_acknowledgement: true,
      email_marketing_opt_in: true,
      email_marketing_consent_source: 'client',
      email_marketing_opt_in_at: '1999-01-01T00:00:00.000Z',
    })
    expect(created.status).toBeLessThan(400)
    state.marketingUserId = created.userId
    const row = await psql(`
      select concat_ws('|',
        essential_email_acknowledged::text,
        email_marketing_opt_in::text,
        email_marketing_consent_source,
        email_marketing_consent_version,
        (email_marketing_opt_in_at > '2026-01-01'::timestamptz)::text
      )
      from public.profiles
      where email = ${sqlText(email)}
    `)
    expect(row).toBe('true|true|auth_signup|2026-10-07-email-marketing|true')

    const signedIn = await authRequest('/token?grant_type=password', {
      email,
      password: 'Test-password-1',
    })
    expect(signedIn.status).toBe(200)
    expect(signedIn.hasSession).toBe(true)
  })

  it('records consent for an unconfirmed auth user before any session exists', async () => {
    const email = 'signup-consent-unconfirmed@example.com'
    await psql(`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      )
      select
        instance_id,
        gen_random_uuid(),
        aud,
        role,
        ${sqlText(email)},
        encrypted_password,
        null,
        raw_app_meta_data,
        jsonb_build_object(
          'essential_email_acknowledgement', true,
          'email_marketing_opt_in', false,
          'essential_email_acknowledgement_source', 'client',
          'essential_email_acknowledged_at', '2000-01-01T00:00:00.000Z'
        ),
        pg_catalog.now(),
        pg_catalog.now(),
        '',
        '',
        '',
        ''
      from auth.users
      where id = ${sqlText(state.essentialUserId ?? '')}
    `)
    const row = await psql(`
      select concat_ws('|',
        (users.email_confirmed_at is null)::text,
        profile.essential_email_acknowledged::text,
        profile.essential_email_acknowledgement_source,
        profile.email_marketing_opt_in::text
      )
      from auth.users as users
      join public.profiles as profile on profile.id = users.id
      where users.email = ${sqlText(email)}
    `)
    expect(row).toBe('true|true|auth_signup|false')
  })

  it('allows an ordinary profile update and rejects consent updates by real grants', async () => {
    const userId = state.essentialUserId
    expect(userId).toBeTruthy()
    const consentGrant = await psql(`
      select count(*)
      from information_schema.column_privileges
      where table_schema = 'public'
        and table_name = 'profiles'
        and grantee = 'authenticated'
        and privilege_type = 'UPDATE'
        and column_name = 'email_marketing_opt_in'
    `)
    const nameGrant = await psql(`
      select count(*)
      from information_schema.column_privileges
      where table_schema = 'public'
        and table_name = 'profiles'
        and grantee = 'authenticated'
        and privilege_type = 'UPDATE'
        and column_name = 'full_name'
    `)
    expect(consentGrant).toBe('0')
    expect(nameGrant).toBe('1')

    const updated = await psql(`
      begin;
      select set_config('request.jwt.claims', ${sqlText(
        JSON.stringify({ sub: userId, role: 'authenticated' })
      )}, true);
      select set_config('request.jwt.claim.sub', ${sqlText(userId ?? '')}, true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      set local role authenticated;
      with updated as (
        update public.profiles
        set full_name = 'Ordinary Update'
        where id = ${sqlText(userId ?? '')}::uuid
        returning id
      )
      select count(*)::text from updated;
      commit;
    `)
    expect(updated).toContain('1')

    const forbidden = await psqlError(`
      begin;
      select set_config('request.jwt.claims', ${sqlText(
        JSON.stringify({ sub: userId, role: 'authenticated' })
      )}, true);
      set local role authenticated;
      update public.profiles
      set email_marketing_opt_in = true
      where id = ${sqlText(userId ?? '')};
      commit;
    `)
    expect(forbidden).toMatch(/42501|permission denied|consent writer/i)
    const serviceForbidden = await psqlError(`
      set local role service_role;
      update public.profiles
      set email_marketing_opt_in = true
      where id = ${sqlText(userId ?? '')}::uuid;
    `)
    expect(serviceForbidden).toMatch(/consent writer|42501/i)
    const stillFalse = await psql(`
      select email_marketing_opt_in::text
      from public.profiles
      where id = ${sqlText(userId ?? '')}
    `)
    expect(stillFalse).toBe('false')
  })

  it('does not let an unrelated security-definer function change consent', async () => {
    const userId = state.essentialUserId
    const fullName = await psql(`
      create or replace function public._test_unrelated_profile_writer(target uuid)
      returns void
      language plpgsql
      security definer
      set search_path = ''
      as $fn$
      begin
        update public.profiles
        set full_name = 'Unrelated Writer'
        where id = target;
      end;
      $fn$;
      select public._test_unrelated_profile_writer(${sqlText(userId ?? '')}::uuid);
      select full_name from public.profiles where id = ${sqlText(userId ?? '')};
    `)
    expect(fullName).toContain('Unrelated Writer')

    let blocked = ''
    try {
      blocked = await psqlError(`
        create or replace function public._test_unrelated_consent_writer(target uuid)
        returns void
        language plpgsql
        security definer
        set search_path = ''
        as $fn$
        begin
          update public.profiles
          set email_marketing_opt_in = true
          where id = target;
        end;
        $fn$;
        select public._test_unrelated_consent_writer(${sqlText(userId ?? '')}::uuid);
      `)
      expect(blocked).toMatch(/consent writer|42501/i)
    } finally {
      await psql(`
        drop function if exists public._test_unrelated_profile_writer(uuid);
        drop function if exists public._test_unrelated_consent_writer(uuid);
      `)
    }
    const unchanged = await psql(`
      select email_marketing_opt_in::text
      from public.profiles
      where id = ${sqlText(userId ?? '')}
    `)
    expect(unchanged).toBe('false')
  })

  it('rejects unauthorized consent RPCs and lets local withdrawal beat enrollment', async () => {
    const userId = state.marketingUserId
    expect(userId).toBeTruthy()

    const anon = await psqlError(`
      set local role anon;
      select public.withdraw_email_marketing();
    `)
    expect(anon).toMatch(/permission denied|42501/i)

    const serviceWithdraw = await psqlError(`
      set local role service_role;
      select public.withdraw_email_marketing();
    `)
    expect(serviceWithdraw).toMatch(/permission denied|42501/i)

    const authenticatedApply = await psqlError(`
      begin;
      select set_config('request.jwt.claims', ${sqlText(
        JSON.stringify({ sub: userId, role: 'authenticated' })
      )}, true);
      set local role authenticated;
      select public.apply_resend_contact_unsubscribe('person@example.com', 'evt-test');
      commit;
    `)
    expect(authenticatedApply).toMatch(/permission denied|42501/i)

    const directRecord = await psqlError(`
      select public.record_signup_email_consent(
        ${sqlText(userId ?? '')}::uuid,
        true,
        true
      );
    `)
    expect(directRecord).toMatch(/account creation|42501|permission denied/i)

    await psql(`
      insert into public.email_marketing_sync (profile_id, action, status)
      values (${sqlText(userId ?? '')}::uuid, 'enroll', 'processing');
    `)
    await psql(`
      begin;
      select set_config('request.jwt.claims', ${sqlText(
        JSON.stringify({ sub: userId, role: 'authenticated' })
      )}, true);
      select set_config('request.jwt.claim.sub', ${sqlText(userId ?? '')}, true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      set local role authenticated;
      select public.withdraw_email_marketing();
      commit;
    `)
    const decision = await psql(`
      begin;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      select set_config('request.jwt.claim.role', 'service_role', true);
      select decision
      from public.recheck_email_marketing_sync((
        select id
        from public.email_marketing_sync
        where profile_id = ${sqlText(userId ?? '')}::uuid
          and action = 'enroll'
        order by created_at desc
        limit 1
      ));
      commit;
    `)
    expect(decision).toContain('skip_withdrawn')
    const optedOut = await psql(`
      select concat_ws('|', email_marketing_opt_in::text, (email_marketing_opted_out_at is not null)::text)
      from public.profiles
      where id = ${sqlText(userId ?? '')}
    `)
    expect(optedOut).toBe('false|true')
  })

  it('enqueues enrollment when email confirmation arrives after marketing opt-in', async () => {
    const email = 'signup-consent-confirm@example.com'
    await psql(`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      )
      select
        instance_id,
        gen_random_uuid(),
        aud,
        role,
        ${sqlText(email)},
        encrypted_password,
        null,
        raw_app_meta_data,
        jsonb_build_object(
          'essential_email_acknowledgement', true,
          'email_marketing_opt_in', true
        ),
        pg_catalog.now(),
        pg_catalog.now(),
        '',
        '',
        '',
        ''
      from auth.users
      where id = ${sqlText(state.essentialUserId ?? '')}
    `)
    const before = await psql(`
      select count(*)
      from public.email_marketing_sync as sync
      join public.profiles as profile on profile.id = sync.profile_id
      where profile.email = ${sqlText(email)}
        and sync.action = 'enroll'
    `)
    expect(before).toBe('0')
    await psql(`
      update auth.users
      set email_confirmed_at = pg_catalog.now()
      where email = ${sqlText(email)}
    `)
    const after = await psql(`
      select sync.status
      from public.email_marketing_sync as sync
      join public.profiles as profile on profile.id = sync.profile_id
      where profile.email = ${sqlText(email)}
        and sync.action = 'enroll'
    `)
    expect(after).toBe('pending')
  })

  it('does not keep a webhook event when the profile update fails', async () => {
    const eventId = 'evt-signup-consent-rollback'
    const failed = await psqlError(`
      begin;
      revoke update (
        email_marketing_opt_in,
        email_marketing_opted_out_at
      ) on table public.profiles from consent_writer;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      select set_config('request.jwt.claim.role', 'service_role', true);
      set local role service_role;
      select public.apply_resend_contact_unsubscribe(
        'signup-consent-essential@example.com',
        ${sqlText(eventId)}
      );
      commit;
    `)
    expect(failed).toMatch(/permission denied|42501/i)
    const stored = await psql(`
      select count(*)
      from public.resend_webhook_events
      where svix_id = ${sqlText(eventId)}
    `)
    expect(stored).toBe('0')

    const applied = await psql(`
      begin;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      select set_config('request.jwt.claim.role', 'service_role', true);
      set local role service_role;
      select public.apply_resend_contact_unsubscribe(
        'signup-consent-essential@example.com',
        ${sqlText(eventId)}
      );
      commit;
    `)
    expect(applied).toContain('applied')
    const duplicate = await psql(`
      begin;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      select set_config('request.jwt.claim.role', 'service_role', true);
      set local role service_role;
      select public.apply_resend_contact_unsubscribe(
        'signup-consent-essential@example.com',
        ${sqlText(eventId)}
      );
      commit;
    `)
    expect(duplicate).toContain('duplicate')
    const rows = await psql(`
      select count(*)
      from public.resend_webhook_events
      where svix_id = ${sqlText(eventId)}
    `)
    expect(rows).toBe('1')
  })

  it('keeps the hook invoker-safe and the consent writers on an empty search path', async () => {
    const hook = await psql(`
      select concat_ws('|',
        prosecdef::text,
        coalesce(array_to_string(proconfig, ','), '')
      )
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where nspname = 'public'
        and proname = 'hook_before_user_created'
    `)
    expect(hook.startsWith('false|')).toBe(true)
    expect(hook).toContain('search_path=')

    const definers = await psql(`
      select proname || '|' || prosecdef::text || '|' || coalesce(array_to_string(proconfig, ','), '')
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where nspname = 'public'
        and proname in (
          'record_signup_email_consent',
          'withdraw_email_marketing',
          'apply_resend_contact_unsubscribe',
          'handle_new_user',
          'recheck_email_marketing_sync',
          'claim_email_marketing_sync_jobs',
          'finish_email_marketing_sync_job',
          'reconcile_provider_marketing_resubscribe'
        )
      order by proname
    `)
    const lines = definers.split('\n').filter((line) => line.trim().length > 0)
    expect(lines).toHaveLength(8)
    for (const line of lines) {
      expect(line).toContain('|true|')
      expect(line).toContain('search_path=')
    }
  })

  async function marketingProfile(email: string) {
    const created = await signUp(email, {
      essential_email_acknowledgement: true,
      email_marketing_opt_in: true,
    })
    expect(created.status).toBeLessThan(400)
    expect(created.userId).toBeTruthy()
    const profileId = created.userId as string
    const pending = await psql(`
      select count(*)
      from public.email_marketing_sync
      where profile_id = ${sqlText(profileId)}::uuid
        and action = 'enroll'
        and status = 'pending'
    `)
    if (pending === '0') {
      await psql(`
        insert into public.email_marketing_sync (profile_id, action, status)
        values (${sqlText(profileId)}::uuid, 'enroll', 'pending')
      `)
    }
    return profileId
  }

  async function claimProfile(profileId: string) {
    const output = await psql(`
      begin;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      select set_config('request.jwt.claim.role', 'service_role', true);
      set local role service_role;
      select concat_ws('|', id::text, attempt_count::text, lease_owner::text, action)
      from public.claim_email_marketing_sync_jobs(1, ${sqlText(profileId)}::uuid);
      commit;
    `)
    return (
      output
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /^[0-9a-f-]{36}\|\d+\|[0-9a-f-]{36}\|/.test(line)) ?? ''
    )
  }

  async function finishProfileJob(input: {
    jobId: string
    token: string
    status: 'pending' | 'synced' | 'skipped' | 'failed'
    error: string | null
    retrySql: string
  }) {
    const errorSql = input.error === null ? 'null' : sqlText(input.error)
    const output = await psql(`
      begin;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      select set_config('request.jwt.claim.role', 'service_role', true);
      set local role service_role;
      select public.finish_email_marketing_sync_job(
        ${sqlText(input.jobId)}::uuid,
        ${sqlText(input.token)}::uuid,
        ${sqlText(input.status)},
        ${errorSql},
        ${input.retrySql}
      )::text;
      commit;
    `)
    return output.split('\n').some((line) => line.trim() === 'true')
  }

  function parseClaim(line: string) {
    const [jobId, attemptCount, token, action] = line.split('|')
    return {
      jobId: jobId ?? '',
      attemptCount: Number(attemptCount),
      token: token ?? '',
      action: action ?? '',
    }
  }

  it('recovers expired leases, rejects stale tokens, and stops at five attempts', async () => {
    const profileId = await marketingProfile('signup-consent-lease-retry@example.com')
    const delays = [60, 300, 900, 3600]
    let jobId = ''

    for (const [index, delay] of delays.entries()) {
      if (index > 0) {
        await psql(`
          update public.email_marketing_sync
          set next_attempt_at = pg_catalog.now() - interval '1 second'
          where id = ${sqlText(jobId)}::uuid
        `)
      }
      const claimed = parseClaim(await claimProfile(profileId))
      expect(claimed.attemptCount).toBe(index + 1)
      expect(claimed.action).toBe('enroll')
      jobId = claimed.jobId
      expect(nextMarketingSyncDelaySeconds(claimed.attemptCount)).toBe(delay)
      const finished = await finishProfileJob({
        jobId: claimed.jobId,
        token: claimed.token,
        status: 'pending',
        error: 'provider_error',
        retrySql: `pg_catalog.now() + make_interval(secs => ${delay})`,
      })
      expect(finished).toBe(true)
      const seconds = Number(
        await psql(`
          select round(extract(epoch from (next_attempt_at - pg_catalog.now())))::text
          from public.email_marketing_sync
          where id = ${sqlText(claimed.jobId)}::uuid
        `)
      )
      expect(seconds).toBeGreaterThanOrEqual(delay - 5)
      expect(seconds).toBeLessThanOrEqual(delay)
    }

    await psql(`
      update public.email_marketing_sync
      set next_attempt_at = pg_catalog.now() - interval '1 second'
      where id = ${sqlText(jobId)}::uuid
    `)
    const fifth = parseClaim(await claimProfile(profileId))
    expect(fifth.attemptCount).toBe(5)
    const terminal = await psqlError(`
      begin;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      select set_config('request.jwt.claim.role', 'service_role', true);
      set local role service_role;
      select public.finish_email_marketing_sync_job(
        ${sqlText(fifth.jobId)}::uuid,
        ${sqlText(fifth.token)}::uuid,
        'pending',
        'provider_error',
        pg_catalog.now() + interval '60 seconds'
      );
      commit;
    `)
    expect(terminal).toMatch(/terminal/)
    await psql(`
      update public.email_marketing_sync
      set lease_expires_at = pg_catalog.now() - interval '1 second'
      where id = ${sqlText(fifth.jobId)}::uuid
    `)
    expect(await claimProfile(profileId)).toBe('')
    const exhausted = await psql(`
      select concat_ws('|', status, attempt_count::text, coalesce(last_error, ''), coalesce(next_attempt_at::text, ''))
      from public.email_marketing_sync
      where id = ${sqlText(fifth.jobId)}::uuid
    `)
    expect(exhausted.startsWith('failed|5|attempt_cap|')).toBe(true)
  })

  it('does not let a stale worker finish a reclaimed lease', async () => {
    const profileId = await marketingProfile('signup-consent-lease-crash@example.com')
    const first = parseClaim(await claimProfile(profileId))
    const denied = await psqlError(`
      begin;
      set local role service_role;
      update public.email_marketing_sync
      set status = 'synced'
      where id = ${sqlText(first.jobId)}::uuid;
      commit;
    `)
    expect(denied).toMatch(/permission denied|42501/i)
    await psql(`
      update public.email_marketing_sync
      set lease_expires_at = pg_catalog.now() - interval '1 second'
      where id = ${sqlText(first.jobId)}::uuid
    `)
    const second = parseClaim(await claimProfile(profileId))
    expect(second.attemptCount).toBe(2)
    expect(second.token).not.toBe(first.token)
    const stale = await finishProfileJob({
      jobId: first.jobId,
      token: first.token,
      status: 'synced',
      error: null,
      retrySql: 'null',
    })
    expect(stale).toBe(false)
    const row = await psql(`
      select concat_ws('|', status, attempt_count::text, lease_owner::text)
      from public.email_marketing_sync
      where id = ${sqlText(first.jobId)}::uuid
    `)
    expect(row).toBe(`processing|2|${second.token}`)
  })

  it('gives concurrent claims distinct jobs', async () => {
    const firstProfile = await marketingProfile('signup-consent-lease-a@example.com')
    const secondProfile = await marketingProfile('signup-consent-lease-b@example.com')
    const [first, second] = await Promise.all([
      claimProfile(firstProfile),
      claimProfile(secondProfile),
    ])
    const claimed = [parseClaim(first), parseClaim(second)]
    expect(claimed.map((job) => job.jobId).sort()).toHaveLength(2)
    expect(new Set(claimed.map((job) => job.jobId)).size).toBe(2)
    expect(claimed.every((job) => job.attemptCount === 1)).toBe(true)

    const [again, other] = await Promise.all([
      claimProfile(firstProfile),
      claimProfile(firstProfile),
    ])
    expect([again, other].filter((line) => line.length > 0)).toEqual([])
    const attempts = await psql(`
      select attempt_count::text
      from public.email_marketing_sync
      where profile_id = ${sqlText(firstProfile)}::uuid
        and action = 'enroll'
    `)
    expect(attempts).toBe('1')
  })

  it('completes a missing-contact withdrawal without a provider write and keeps the opt-out', async () => {
    const profileId = await marketingProfile('signup-consent-lease-missing@example.com')
    await psql(`
      select public.apply_email_marketing_withdrawal(${sqlText(profileId)}::uuid)
    `)
    const claimed = parseClaim(await claimProfile(profileId))
    expect(claimed.action).toBe('withdraw')
    const calls: string[] = []
    const decision = await runEmailMarketingSyncAttempt({
      action: 'withdraw',
      readLocal: async () => {
        const row = await psql(`
          select concat_ws('|',
            email,
            email_marketing_opt_in::text,
            (email_marketing_opted_out_at is not null)::text
          )
          from public.profiles
          where id = ${sqlText(profileId)}::uuid
        `)
        const [email, optIn, optedOut] = row.split('|')
        return {
          email: email ?? null,
          emailConfirmed: true,
          optIn: optIn === 'true',
          optedOutAt: optedOut === 'true' ? '2026-10-07T00:00:00.000Z' : null,
        }
      },
      lookupProvider: async () => {
        calls.push('GET')
        return 'missing'
      },
      send: async (input) => {
        calls.push(input.method)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('missing contact must not record a provider unsubscribe')
      },
    })
    expect(decision).toBe('withdraw_contact_absent')
    expect(calls).toEqual(['GET'])
    expect(
      await finishProfileJob({
        jobId: claimed.jobId,
        token: claimed.token,
        status: 'synced',
        error: null,
        retrySql: 'null',
      })
    ).toBe(true)
    const optedOut = await psql(`
      select concat_ws('|', email_marketing_opt_in::text, (email_marketing_opted_out_at is not null)::text)
      from public.profiles
      where id = ${sqlText(profileId)}::uuid
    `)
    expect(optedOut).toBe('false|true')
  })

  it('schedules a retry when contact lookup fails', async () => {
    const profileId = await marketingProfile('signup-consent-lease-lookup@example.com')
    await psql(`
      select public.apply_email_marketing_withdrawal(${sqlText(profileId)}::uuid)
    `)
    const claimed = parseClaim(await claimProfile(profileId))
    expect(claimed.action).toBe('withdraw')
    const calls: string[] = []
    await expect(
      runEmailMarketingSyncAttempt({
        action: 'withdraw',
        readLocal: async () => ({
          email: 'signup-consent-lease-lookup@example.com',
          emailConfirmed: true,
          optIn: false,
          optedOutAt: '2026-10-07T00:00:00.000Z',
        }),
        lookupProvider: async () => {
          throw new Error('provider_lookup_failed')
        },
        send: async (input) => {
          calls.push(input.method)
        },
        recordProviderUnsubscribe: async () => undefined,
      })
    ).rejects.toThrow('provider_lookup_failed')
    expect(calls).toEqual([])
    const delay = nextMarketingSyncDelaySeconds(claimed.attemptCount)
    expect(delay).toBe(60)
    expect(
      await finishProfileJob({
        jobId: claimed.jobId,
        token: claimed.token,
        status: 'pending',
        error: 'provider_error',
        retrySql: `pg_catalog.now() + make_interval(secs => ${delay})`,
      })
    ).toBe(true)
    expect(await claimProfile(profileId)).toBe('')
    const row = await psql(`
      select concat_ws('|', status, last_error, attempt_count::text)
      from public.email_marketing_sync
      where id = ${sqlText(claimed.jobId)}::uuid
    `)
    expect(row).toBe('pending|provider_error|1')
    const stillOut = await psql(`
      select (email_marketing_opted_out_at is not null)::text
      from public.profiles
      where id = ${sqlText(profileId)}::uuid
    `)
    expect(stillOut).toBe('true')
  })

  it('keeps withdrawal work when a slow or expired enrollment overlaps it', async () => {
    const profileId = await marketingProfile('signup-consent-lease-race@example.com')
    const enrollment = parseClaim(await claimProfile(profileId))
    expect(enrollment.action).toBe('enroll')
    const sends: string[] = []
    let reads = 0
    const decision = await runEmailMarketingSyncAttempt({
      action: 'enroll',
      readLocal: async () => {
        reads += 1
        const row = await psql(`
          select concat_ws('|',
            public.profiles.email,
            (auth.users.email_confirmed_at is not null)::text,
            public.profiles.email_marketing_opt_in::text,
            (public.profiles.email_marketing_opted_out_at is not null)::text
          )
          from public.profiles
          join auth.users on auth.users.id = public.profiles.id
          where public.profiles.id = ${sqlText(profileId)}::uuid
        `)
        const [email, confirmed, optIn, optedOut] = row.split('|')
        return {
          email: email ?? null,
          emailConfirmed: confirmed === 'true',
          optIn: optIn === 'true',
          optedOutAt: optedOut === 'true' ? '2026-10-07T00:00:00.000Z' : null,
        }
      },
      lookupProvider: async () => {
        await psql(`
          select public.apply_email_marketing_withdrawal(${sqlText(profileId)}::uuid)
        `)
        return 'subscribed'
      },
      send: async (input) => {
        sends.push(input.method)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('withdrawal must cancel enrollment before a provider write')
      },
    })
    expect(reads).toBeGreaterThan(1)
    expect(decision).toBe('skip_withdrawn')
    expect(sends).toEqual([])
    expect(
      await finishProfileJob({
        jobId: enrollment.jobId,
        token: enrollment.token,
        status: 'synced',
        error: null,
        retrySql: 'null',
      })
    ).toBe(false)
    const withdraw = await psql(`
      select status
      from public.email_marketing_sync
      where profile_id = ${sqlText(profileId)}::uuid
        and action = 'withdraw'
    `)
    expect(withdraw).toBe('pending')

    await psql(`
      update public.email_marketing_sync
      set
        status = 'processing',
        lease_owner = gen_random_uuid(),
        lease_expires_at = pg_catalog.now() - interval '1 second',
        attempt_count = 1
      where id = ${sqlText(enrollment.jobId)}::uuid
    `)
    const staleToken = await psql(`
      select lease_owner::text
      from public.email_marketing_sync
      where id = ${sqlText(enrollment.jobId)}::uuid
    `)
    await psql(`
      select public.apply_email_marketing_withdrawal(${sqlText(profileId)}::uuid)
    `)
    expect(
      await finishProfileJob({
        jobId: enrollment.jobId,
        token: staleToken,
        status: 'synced',
        error: null,
        retrySql: 'null',
      })
    ).toBe(false)
    const reclaimed = parseClaim(await claimProfile(profileId))
    expect(reclaimed.action).toBe('withdraw')
    const jobs = await psql(`
      select action || ':' || status
      from public.email_marketing_sync
      where profile_id = ${sqlText(profileId)}::uuid
      order by action
    `)
    expect(jobs).toContain('enroll:skipped')
    expect(jobs).toContain('withdraw:processing')
    expect(reclaimed.token).not.toBe(staleToken)
  })

  const webhookSecret = `whsec_${Buffer.from('signup-consent-test-secret').toString('base64')}`

  function signWebhook(payload: string, id: string) {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const key = Buffer.from(webhookSecret.slice('whsec_'.length), 'base64')
    const digest = createHmac('sha256', key)
      .update(`${id}.${timestamp}.${payload}`)
      .digest('base64')
    return { id, timestamp, signature: `v1,${digest}` }
  }

  async function consentState(profileId: string) {
    return psql(`
      select concat_ws('|',
        email_marketing_opt_in::text,
        (email_marketing_opted_out_at is not null)::text
      )
      from public.profiles
      where id = ${sqlText(profileId)}::uuid
    `)
  }

  async function activeWithdrawals(profileId: string) {
    return psql(`
      select count(*)::text
      from public.email_marketing_sync
      where profile_id = ${sqlText(profileId)}::uuid
        and action = 'withdraw'
        and status in ('pending', 'processing')
    `)
  }

  async function reconcileResubscribe(email: string, eventId: string) {
    const output = await psql(`
      begin;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      select set_config('request.jwt.claim.role', 'service_role', true);
      set local role service_role;
      select public.reconcile_provider_marketing_resubscribe(
        ${sqlText(email)},
        ${sqlText(eventId)}
      );
      commit;
    `)
    const line = output
      .split('\n')
      .map((value) => value.trim())
      .find((value): value is ResubscribeReconciliation =>
        value === 'correction_queued' ||
        value === 'correction_pending' ||
        value === 'duplicate' ||
        value === 'ignored'
      )
    if (!line) throw new Error(output)
    return line
  }

  async function completeInitialWithdrawal(profileId: string) {
    await psql(`
      select public.apply_email_marketing_withdrawal(${sqlText(profileId)}::uuid)
    `)
    const claimed = parseClaim(await claimProfile(profileId))
    expect(claimed.action).toBe('withdraw')
    expect(
      await finishProfileJob({
        jobId: claimed.jobId,
        token: claimed.token,
        status: 'synced',
        error: null,
        retrySql: 'null',
      })
    ).toBe(true)
    expect(await consentState(profileId)).toBe('false|true')
    expect(await activeWithdrawals(profileId)).toBe('0')
  }

  async function verifiedResubscribe(email: string, eventId: string) {
    const raw = JSON.stringify({
      type: 'contact.updated',
      data: { email, unsubscribed: false },
    })
    const signed = signWebhook(raw, eventId)
    return handleResendContactWebhook({
      rawBody: raw,
      svixId: signed.id,
      svixTimestamp: signed.timestamp,
      svixSignature: signed.signature,
      secret: webhookSecret,
      applyUnsubscribe: async () => {
        throw new Error('a subscribed update must not opt the profile back in')
      },
      reconcileResubscribe,
      recordDelivery: async () => {
        throw new Error('a subscribed update must queue reconciliation')
      },
    })
  }

  it('queues one correction after withdrawal when a later subscribed update arrives', async () => {
    const email = 'signup-consent-reconcile-late@example.com'
    const profileId = await marketingProfile(email)
    await completeInitialWithdrawal(profileId)

    const queued = await verifiedResubscribe(email, 'msg-late-enroll')
    expect(queued.body.correction).toBe('correction_queued')
    expect(await activeWithdrawals(profileId)).toBe('1')
    expect(await consentState(profileId)).toBe('false|true')

    const pending = await verifiedResubscribe(email, 'msg-late-enroll-2')
    expect(pending.body.correction).toBe('correction_pending')
    expect(await activeWithdrawals(profileId)).toBe('1')

    const duplicate = await verifiedResubscribe(email, 'msg-late-enroll')
    expect(duplicate.body.duplicate).toBe(true)
    expect(await activeWithdrawals(profileId)).toBe('1')
    expect(await consentState(profileId)).toBe('false|true')

    const calls: string[] = []
    const claimed = parseClaim(await claimProfile(profileId))
    expect(claimed.action).toBe('withdraw')
    const decision = await runEmailMarketingSyncAttempt({
      action: 'withdraw',
      readLocal: async () => ({
        email,
        emailConfirmed: true,
        optIn: false,
        optedOutAt: '2026-10-07T00:00:00.000Z',
      }),
      lookupProvider: async () => {
        calls.push('GET')
        return 'subscribed'
      },
      send: async (input) => {
        calls.push(`${input.method}:${String(input.body.unsubscribed)}`)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('correction must not opt the profile back in')
      },
    })
    expect(decision).toBe('send_unsubscribed_true')
    expect(calls).toEqual(['GET', 'PATCH:true'])
    expect(
      await finishProfileJob({
        jobId: claimed.jobId,
        token: claimed.token,
        status: 'synced',
        error: null,
        retrySql: 'null',
      })
    ).toBe(true)
    expect(await consentState(profileId)).toBe('false|true')
  })

  it('does not enqueue a correction for an invalid resubscribe signature', async () => {
    const email = 'signup-consent-reconcile-bad@example.com'
    const profileId = await marketingProfile(email)
    await completeInitialWithdrawal(profileId)
    const raw = JSON.stringify({
      type: 'contact.updated',
      data: { email, unsubscribed: false },
    })
    let calls = 0
    const result = await handleResendContactWebhook({
      rawBody: raw,
      svixId: 'msg-bad-reconcile',
      svixTimestamp: String(Math.floor(Date.now() / 1000)),
      svixSignature: 'v1,not-a-real-signature',
      secret: webhookSecret,
      applyUnsubscribe: async () => {
        calls += 1
        return 'applied'
      },
      reconcileResubscribe: async () => {
        calls += 1
        return 'correction_queued'
      },
      recordDelivery: async () => {
        calls += 1
        return 'new'
      },
    })
    expect(result.status).toBe(400)
    expect(calls).toBe(0)
    expect(await activeWithdrawals(profileId)).toBe('0')
    expect(await consentState(profileId)).toBe('false|true')
  })

  it('treats a missing contact on a corrective withdrawal as a successful no-op', async () => {
    const email = 'signup-consent-reconcile-missing@example.com'
    const profileId = await marketingProfile(email)
    await completeInitialWithdrawal(profileId)
    expect((await verifiedResubscribe(email, 'msg-missing-correction')).body.correction).toBe(
      'correction_queued'
    )
    const claimed = parseClaim(await claimProfile(profileId))
    const calls: string[] = []
    const decision = await runEmailMarketingSyncAttempt({
      action: 'withdraw',
      readLocal: async () => ({
        email,
        emailConfirmed: true,
        optIn: false,
        optedOutAt: '2026-10-07T00:00:00.000Z',
      }),
      lookupProvider: async () => {
        calls.push('GET')
        return 'missing'
      },
      send: async (input) => {
        calls.push(input.method)
      },
      recordProviderUnsubscribe: async () => {
        throw new Error('a missing contact must not be created')
      },
    })
    expect(decision).toBe('withdraw_contact_absent')
    expect(calls).toEqual(['GET'])
    expect(
      await finishProfileJob({
        jobId: claimed.jobId,
        token: claimed.token,
        status: 'synced',
        error: null,
        retrySql: 'null',
      })
    ).toBe(true)
    expect(await consentState(profileId)).toBe('false|true')
  })

  it('leaves an exhausted corrective withdrawal failed instead of synced', async () => {
    const email = 'signup-consent-reconcile-fail@example.com'
    const profileId = await marketingProfile(email)
    await completeInitialWithdrawal(profileId)
    expect((await verifiedResubscribe(email, 'msg-fail-correction')).body.correction).toBe(
      'correction_queued'
    )
    let jobId = ''
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const claimed = parseClaim(await claimProfile(profileId))
      expect(claimed.attemptCount).toBe(attempt)
      jobId = claimed.jobId
      const delay = nextMarketingSyncDelaySeconds(attempt)
      expect(delay).not.toBeNull()
      expect(
        await finishProfileJob({
          jobId,
          token: claimed.token,
          status: 'pending',
          error: 'provider_error',
          retrySql: `pg_catalog.now() - interval '1 second'`,
        })
      ).toBe(true)
    }
    const fifth = parseClaim(await claimProfile(profileId))
    expect(fifth.attemptCount).toBe(5)
    expect(fifth.jobId).toBe(jobId)
    await psql(`
      update public.email_marketing_sync
      set lease_expires_at = pg_catalog.now() - interval '1 second'
      where id = ${sqlText(fifth.jobId)}::uuid
    `)
    expect(await claimProfile(profileId)).toBe('')
    const row = await psql(`
      select concat_ws('|', status, attempt_count::text, coalesce(last_error, ''))
      from public.email_marketing_sync
      where id = ${sqlText(fifth.jobId)}::uuid
    `)
    expect(row).toBe('failed|5|attempt_cap')
    expect(await consentState(profileId)).toBe('false|true')
  })

  it('does not keep a resubscribe event when corrective enqueue fails', async () => {
    const email = 'signup-consent-reconcile-rollback@example.com'
    const profileId = await marketingProfile(email)
    await completeInitialWithdrawal(profileId)
    await psql(`
      create or replace function public.signup_consent_fail_withdraw_insert()
      returns trigger
      language plpgsql
      as $fn$
      begin
        if new.action = 'withdraw' then
          raise exception 'forced withdraw failure';
        end if;
        return new;
      end;
      $fn$;
      drop trigger if exists signup_consent_fail_withdraw_insert on public.email_marketing_sync;
      create trigger signup_consent_fail_withdraw_insert
      before insert on public.email_marketing_sync
      for each row
      execute function public.signup_consent_fail_withdraw_insert();
    `)
    try {
      const failed = await psqlError(`
        begin;
        select set_config('request.jwt.claims', '{"role":"service_role"}', true);
        select set_config('request.jwt.claim.role', 'service_role', true);
        set local role service_role;
        select public.reconcile_provider_marketing_resubscribe(
          ${sqlText(email)},
          'msg-reconcile-rollback'
        );
        commit;
      `)
      expect(failed).toMatch(/forced withdraw failure/)
      const events = await psql(`
        select count(*)::text
        from public.resend_webhook_events
        where svix_id = 'msg-reconcile-rollback'
      `)
      expect(events).toBe('0')
      expect(await activeWithdrawals(profileId)).toBe('0')
      expect(await consentState(profileId)).toBe('false|true')
    } finally {
      await psql(`
        drop trigger if exists signup_consent_fail_withdraw_insert on public.email_marketing_sync;
        drop function if exists public.signup_consent_fail_withdraw_insert();
      `)
    }
  })
})
