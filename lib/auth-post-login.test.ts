import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(
  join(__dirname, 'auth-post-login.ts'),
  'utf8'
)

describe('postLoginPath', () => {
  it('sends approved members to /dashboard and others to /application', () => {
    expect(source).toContain("Promise<'/dashboard' | '/application'>")
    expect(source).toContain("if (!user) return '/dashboard'")
    expect(source).toContain("? '/dashboard' : '/application'")
    expect(source).not.toContain("? '/members' : '/application'")
  })
})
