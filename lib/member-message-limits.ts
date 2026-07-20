export const MAX_MEMBER_MESSAGE_LENGTH = 2000

export function normalizeMemberMessageBody(body: string): string {
  return body.trim()
}

export function validateMemberMessageBody(body: string): string | null {
  const normalized = normalizeMemberMessageBody(body)
  if (!normalized) {
    return 'Message cannot be empty.'
  }
  if (normalized.length > MAX_MEMBER_MESSAGE_LENGTH) {
    return `Messages must be ${MAX_MEMBER_MESSAGE_LENGTH} characters or fewer.`
  }
  return null
}
