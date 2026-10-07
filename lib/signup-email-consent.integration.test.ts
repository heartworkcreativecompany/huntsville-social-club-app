import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
          'claim_email_marketing_sync_jobs'
        )
      order by proname
    `)
    const lines = definers.split('\n').filter((line) => line.trim().length > 0)
    expect(lines).toHaveLength(6)
    for (const line of lines) {
      expect(line).toContain('|true|')
      expect(line).toContain('search_path=')
    }
  })
})
