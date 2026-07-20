/** US-focused E.164 normalization for Supabase Auth phone OTP. */

const US_E164_PATTERN = /^\+1[2-9]\d{9}$/

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function normalizePhoneToE164(
  value: string,
  defaultCountry: 'US' = 'US'
): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('+')) {
    const digits = digitsOnly(trimmed)
    if (digits.length < 8) return null
    return `+${digits}`
  }

  if (defaultCountry === 'US') {
    const digits = digitsOnly(trimmed)
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  }

  return null
}

export function validatePhoneInput(value: string): string | null {
  const normalized = normalizePhoneToE164(value)
  if (!normalized) {
    return 'Enter a valid mobile number with area code (e.g. 256 555 0100).'
  }
  if (!US_E164_PATTERN.test(normalized)) {
    return 'Enter a valid US mobile number in E.164 format (10-digit number with area code).'
  }
  return null
}

export function phonesMatchE164(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const left = normalizePhoneToE164(a)
  const right = normalizePhoneToE164(b)
  return Boolean(left && right && left === right)
}

/** Display-friendly US format — never shown on public member profiles. */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return ''
  const normalized = normalizePhoneToE164(e164)
  if (!normalized || !US_E164_PATTERN.test(normalized)) return e164
  const digits = normalized.slice(2)
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
