/**
 * Local CLI helper: optionally load `.env.local` into process.env.
 * - Does not override variables already set in the environment (production-safe).
 * - Never logs values.
 * - Intended for Node/tsx scripts only — Next.js already loads .env* itself.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL_ENV_FILE = '.env.local'

/** Parse a single .env line into [key, value] or null. Values are never logged. */
export function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const eq = trimmed.indexOf('=')
  if (eq <= 0) return null

  const key = trimmed.slice(0, eq).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null

  let value = trimmed.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return [key, value]
}

/**
 * Load key/value pairs from `.env.local` at repo root into process.env when unset.
 * Returns the count of keys applied (not values).
 */
export function loadLocalEnvFile(options?: {
  cwd?: string
  filename?: string
  env?: NodeJS.ProcessEnv
}): { loaded: boolean; appliedKeyCount: number; path: string } {
  const cwd = options?.cwd ?? process.cwd()
  const filename = options?.filename ?? LOCAL_ENV_FILE
  const env = options?.env ?? process.env
  const path = resolve(cwd, filename)

  if (!existsSync(path)) {
    return { loaded: false, appliedKeyCount: 0, path }
  }

  const raw = readFileSync(path, 'utf8')
  let appliedKeyCount = 0

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue
    const [key, value] = parsed
    const existing = env[key]
    if (typeof existing === 'string' && existing.length > 0) {
      continue
    }
    env[key] = value
    appliedKeyCount += 1
  }

  return { loaded: true, appliedKeyCount, path }
}
