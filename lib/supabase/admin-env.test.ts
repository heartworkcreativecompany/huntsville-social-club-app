import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  ADMIN_CLIENT_REQUIRED_ENV_VARS,
  formatMissingAdminClientEnvMessage,
  isAdminClientEnvConfigured,
  missingAdminClientEnvVars,
} from '@/lib/supabase/admin-env'
import { loadLocalEnvFile, parseEnvLine } from '@/lib/cli/load-local-env'

describe('admin client env validation', () => {
  it('lists exact required variable names', () => {
    expect(ADMIN_CLIENT_REQUIRED_ENV_VARS).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
  })

  it('reports missing env var names only (never values)', () => {
    const missing = missingAdminClientEnvVars({
      NEXT_PUBLIC_SUPABASE_URL: '',
      // SUPABASE_SERVICE_ROLE_KEY intentionally absent
    } as NodeJS.ProcessEnv)

    expect(missing).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
    expect(formatMissingAdminClientEnvMessage(missing)).toBe(
      'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    )
  })

  it('treats whitespace-only values as missing', () => {
    expect(
      missingAdminClientEnvVars({
        NEXT_PUBLIC_SUPABASE_URL: '   ',
        SUPABASE_SERVICE_ROLE_KEY: '  ',
      } as NodeJS.ProcessEnv)
    ).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
  })

  it('passes when both required vars are set', () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    } as NodeJS.ProcessEnv
    expect(missingAdminClientEnvVars(env)).toEqual([])
    expect(isAdminClientEnvConfigured(env)).toBe(true)
  })
})

describe('load-local-env parseEnvLine', () => {
  it('parses keys without exposing how values are quoted', () => {
    expect(parseEnvLine('NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co')).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://x.supabase.co',
    ])
    expect(parseEnvLine('SUPABASE_SERVICE_ROLE_KEY="abc"')).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY',
      'abc',
    ])
    expect(parseEnvLine('# comment')).toBeNull()
    expect(parseEnvLine('')).toBeNull()
  })
})

describe('loadLocalEnvFile', () => {
  it('does not override already-set process env (production-safe)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-load-'))
    try {
      writeFileSync(
        join(dir, '.env.local'),
        'NEXT_PUBLIC_SUPABASE_URL=https://from-file.example\nSUPABASE_SERVICE_ROLE_KEY=from-file\n',
        'utf8'
      )
      const env = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://already-set.example',
      } as NodeJS.ProcessEnv

      const result = loadLocalEnvFile({ cwd: dir, env })
      expect(result.loaded).toBe(true)
      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://already-set.example')
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('from-file')
      expect(result.appliedKeyCount).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
