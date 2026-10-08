import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dbContainer = 'hsc-signup-consent-db'
const authContainer = 'hsc-signup-consent-auth'
const network = 'hsc-signup-consent'
const dbPort = '55440'
const authPort = '55441'
const postgresImage = 'public.ecr.aws/supabase/postgres:17.6.1.156'
const gotrueImage = 'public.ecr.aws/supabase/gotrue:v2.195.0'
const jwtSecret = 'super-secret-jwt-token-with-at-least-32-characters-long'
const anonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const dbPassword = randomBytes(18).toString('hex')

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.stdio ?? 'inherit', ...options })
    let captured = ''
    if (options.capture) {
      child.stdout?.on('data', (chunk) => {
        captured += chunk.toString()
      })
      child.stderr?.on('data', (chunk) => {
        captured += chunk.toString()
      })
    }
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(captured)
      else reject(new Error(`${command} ${args[0] ?? ''} exited ${code}\n${captured}`))
    })
  })
}

async function docker(args, options) {
  return run('docker', args, options)
}

async function dockerRetry(args, attempts = 8) {
  let lastError = new Error('docker command failed')
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await docker(args)
    } catch (error) {
      lastError = error instanceof Error ? error : lastError
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw lastError
}

async function psqlFile(file, user = 'postgres') {
  const sql = await readFile(path.join(root, file))
  await new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        dbContainer,
        'psql',
        '-U',
        user,
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] }
    )
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`psql ${file} exited ${code}`))
    })
    child.stdin.end(sql)
  })
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const logs = await run('docker', ['logs', dbContainer], {
      capture: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).catch(() => '')
    const ready = String(logs).lastIndexOf('database system is ready to accept connections')
    const shutdown = String(logs).lastIndexOf('database system is shut down')
    if (ready !== -1 && ready > shutdown) {
      try {
        await docker(
          [
            'exec',
            dbContainer,
            'psql',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-c',
            'select 1',
          ],
          { stdio: 'ignore' }
        )
        return
      } catch {
        // The image can restart once during its first startup.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Isolated Postgres did not become ready.')
}

async function removeContainers() {
  await docker(['rm', '-f', authContainer, dbContainer], { stdio: 'ignore' }).catch(
    () => undefined
  )
  await docker(['network', 'rm', network], { stdio: 'ignore' }).catch(() => undefined)
}

async function main() {
  await removeContainers()
  await docker(['network', 'create', network])
  await docker([
    'run',
    '-d',
    '--name',
    dbContainer,
    '--network',
    network,
    '-p',
    `${dbPort}:5432`,
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    postgresImage,
  ])
  await waitForPostgres()
  await dockerRetry([
    'exec',
    dbContainer,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `do $disable_event_triggers$
     declare
       trigger_name text;
     begin
       foreach trigger_name in array array[
         'issue_graphql_placeholder',
         'pgrst_ddl_watch',
         'pgrst_drop_watch',
         'issue_pg_cron_access',
         'issue_pg_net_access',
         'issue_pg_graphql_access'
       ]
       loop
         if exists (
           select 1 from pg_catalog.pg_event_trigger where evtname = trigger_name
         ) then
           execute format('alter event trigger %I disable', trigger_name);
         end if;
       end loop;
     end
     $disable_event_triggers$;`,
  ])
  await dockerRetry([
    'exec',
    dbContainer,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `alter role supabase_auth_admin password '${dbPassword}';`,
  ])
  await dockerRetry([
    'exec',
    dbContainer,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'alter table auth.users add column if not exists email_confirmed_at timestamptz, add column if not exists email_change_token_new text;',
  ])
  await psqlFile('supabase/tests/signup-email-consent/baseline.sql')
  await docker([
    'exec',
    dbContainer,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'alter role postgres superuser;',
  ])
  await psqlFile('supabase/migrations/20261007180000_signup_email_consent.sql')
  await psqlFile('supabase/migrations/20261008030000_signup_names.sql')
  await docker([
    'exec',
    dbContainer,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'alter role postgres nosuperuser;',
  ])
  await docker([
    'run',
    '-d',
    '--name',
    authContainer,
    '--network',
    network,
    '-p',
    `${authPort}:9999`,
    '-e',
    'GOTRUE_DB_DRIVER=postgres',
    '-e',
    `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${dbPassword}@${dbContainer}:5432/postgres`,
    '-e',
    `GOTRUE_JWT_SECRET=${jwtSecret}`,
    '-e',
    'GOTRUE_JWT_EXP=3600',
    '-e',
    'GOTRUE_DISABLE_SIGNUP=false',
    '-e',
    'GOTRUE_EXTERNAL_EMAIL_ENABLED=true',
    '-e',
    'GOTRUE_MAILER_AUTOCONFIRM=true',
    '-e',
    'GOTRUE_SITE_URL=http://127.0.0.1:3000',
    '-e',
    `API_EXTERNAL_URL=http://127.0.0.1:${authPort}`,
    '-e',
    'GOTRUE_API_HOST=0.0.0.0',
    '-e',
    'PORT=9999',
    '-e',
    'GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED=true',
    '-e',
    'GOTRUE_HOOK_BEFORE_USER_CREATED_URI=pg-functions://postgres/public/hook_before_user_created',
    gotrueImage,
  ])
  let authReady = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${authPort}/health`)
      if (response.ok || response.status === 401) {
        authReady = true
        break
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  if (!authReady) {
    const logs = await run('docker', ['logs', authContainer], {
      capture: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).catch((error) => (error instanceof Error ? error.message : 'no logs'))
    const text = String(logs).replace(/postgres(?:ql)?:\/\/\S+/gi, '[database-url]')
    throw new Error(`GoTrue did not become ready.\n${text.slice(-2000)}`)
  }

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['vitest', 'run', '--config', 'vitest.integration.config.ts'],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          SIGNUP_CONSENT_API_URL: `http://127.0.0.1:${authPort}`,
          SIGNUP_CONSENT_ANON_KEY: anonKey,
          SIGNUP_CONSENT_DB_CONTAINER: dbContainer,
        },
      }
    )
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
  if (exitCode !== 0) process.exitCode = exitCode
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : 'integration failed'
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[database-url]'))
  process.exitCode = 1
} finally {
  await removeContainers()
}
