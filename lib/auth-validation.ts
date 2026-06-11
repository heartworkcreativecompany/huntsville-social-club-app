export function validateEmail(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) return 'Email is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Enter a valid email address.'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.'
  if (password.length < 8) {
    return 'Password must be at least 8 characters.'
  }
  return null
}

export function validatePasswordConfirmation(
  password: string,
  confirm: string
): string | null {
  if (!confirm) return 'Please confirm your password.'
  if (password !== confirm) return 'Passwords do not match.'
  return null
}
