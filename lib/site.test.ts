import { describe, expect, it, afterEach } from 'vitest'
import { appOrigin, authCallbackUrl } from '@/lib/site'

const ORIGINAL = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('appOrigin / authCallbackUrl', () => {
  it('uses NEXT_PUBLIC_APP_URL when set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://club.example.com/'
    delete process.env.VERCEL_URL
    expect(appOrigin()).toBe('https://club.example.com')
    expect(authCallbackUrl('/login')).toBe(
      'https://club.example.com/auth/callback?next=%2Flogin'
    )
  })

  it('defaults to localhost in non-deployed environments', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_URL
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
    process.env.NODE_ENV = 'development'
    expect(appOrigin()).toBe('http://localhost:3000')
  })

  it('rejects localhost NEXT_PUBLIC_APP_URL when deployed', () => {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    expect(() => appOrigin()).toThrow(/must not point at localhost/i)
  })

  it('requires NEXT_PUBLIC_APP_URL or VERCEL_URL when deployed', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_URL
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
    expect(() => appOrigin()).toThrow(/NEXT_PUBLIC_APP_URL is required/i)
  })
})
