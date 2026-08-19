/**
 * Admin (service-role) client env checks.
 * Never log or return secret values — names only.
 */

export const ADMIN_CLIENT_REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

export type AdminClientEnvVar = (typeof ADMIN_CLIENT_REQUIRED_ENV_VARS)[number]

/** Returns names of required admin-client env vars that are unset or empty. */
export function missingAdminClientEnvVars(
  env: NodeJS.ProcessEnv = process.env
): AdminClientEnvVar[] {
  return ADMIN_CLIENT_REQUIRED_ENV_VARS.filter((name) => {
    const value = env[name]
    return typeof value !== 'string' || value.trim().length === 0
  })
}

export function formatMissingAdminClientEnvMessage(
  missing: readonly string[]
): string {
  return `Missing required environment variables: ${missing.join(', ')}`
}

export function isAdminClientEnvConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return missingAdminClientEnvVars(env).length === 0
}
