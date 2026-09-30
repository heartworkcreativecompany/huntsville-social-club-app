/**
 * Short-lived proof that the current browser completed a password-recovery
 * code exchange. Supabase's exchanged session is otherwise an ordinary
 * session, so getSession/getUser alone cannot authorize a password change.
 *
 * The marker is an httpOnly cookie set only by the auth callback after
 * exchangeCodeForSession (or verifyOtp) succeeds for a recovery redirect.
 * Its value is HMAC-signed with the existing server secret, bound to that
 * exchanged user id, and expires after ten minutes. It is cleared after a
 * successful update and whenever a recovery callback does not establish it.
 */

export const PASSWORD_RECOVERY_COOKIE = 'hsc_password_recovery'
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 10 * 60

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function passwordRecoverySecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
}

export function passwordRecoveryCookieOptions(maxAge = PASSWORD_RECOVERY_MAX_AGE_SECONDS): {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  }
}

export function recoveryAllowsPasswordUpdate(
  markerUserId: string | null,
  sessionUserId: string | null | undefined
): boolean {
  if (!markerUserId || !sessionUserId) return false
  return markerUserId === sessionUserId
}

export async function createPasswordRecoveryMarker(
  userId: string,
  secret: string,
  nowMs = Date.now()
): Promise<string | null> {
  if (!secret || !isRecoveryUserId(userId)) return null
  const exp = nowMs + PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000
  const payload = `${userId}.${exp}`
  const signature = await signPayload(secret, payload)
  if (!signature) return null
  return `${payload}.${signature}`
}

export async function verifyPasswordRecoveryMarker(
  value: string | undefined,
  secret: string,
  nowMs = Date.now()
): Promise<string | null> {
  if (!value || !secret) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [userId, expRaw, signature] = parts
  if (!userId || !expRaw || !signature || !isRecoveryUserId(userId)) return null
  if (!/^\d+$/.test(expRaw)) return null
  const exp = Number(expRaw)
  if (!Number.isSafeInteger(exp) || exp <= nowMs) return null
  const valid = await signaturesMatch(secret, `${userId}.${expRaw}`, signature)
  return valid ? userId : null
}

function isRecoveryUserId(userId: string): boolean {
  return USER_ID_PATTERN.test(userId)
}

async function signPayload(secret: string, payload: string): Promise<string | null> {
  const key = await hmacKey(secret)
  if (!key) return null
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  )
  return encodeBase64Url(new Uint8Array(signature))
}

async function signaturesMatch(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  const expected = await signPayload(secret, payload)
  if (!expected) return false
  const actualBytes = decodeBase64Url(signature)
  const expectedBytes = decodeBase64Url(expected)
  if (!actualBytes || !expectedBytes || actualBytes.length !== expectedBytes.length) {
    return false
  }
  let mismatch = 0
  for (let i = 0; i < actualBytes.length; i += 1) {
    mismatch |= actualBytes[i]! ^ expectedBytes[i]!
  }
  return mismatch === 0
}

async function hmacKey(secret: string): Promise<CryptoKey | null> {
  if (!secret) return null
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  const padLength = (4 - (padded.length % 4)) % 4
  try {
    const binary = atob(padded + '='.repeat(padLength))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}
