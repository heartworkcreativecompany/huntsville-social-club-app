import { describe, expect, it } from 'vitest'
import {
  MAX_MEMBER_MESSAGE_LENGTH,
  validateMemberMessageBody,
} from '@/lib/member-message-limits'

describe('validateMemberMessageBody', () => {
  it('rejects empty and whitespace-only messages', () => {
    expect(validateMemberMessageBody('')).toBe('Message cannot be empty.')
    expect(validateMemberMessageBody('   \n\t  ')).toBe(
      'Message cannot be empty.'
    )
  })

  it('accepts trimmed messages within the limit', () => {
    expect(validateMemberMessageBody('  hello there  ')).toBeNull()
    expect(validateMemberMessageBody('a'.repeat(MAX_MEMBER_MESSAGE_LENGTH))).toBeNull()
  })

  it('rejects messages over the limit', () => {
    expect(
      validateMemberMessageBody('a'.repeat(MAX_MEMBER_MESSAGE_LENGTH + 1))
    ).toContain(String(MAX_MEMBER_MESSAGE_LENGTH))
  })
})
