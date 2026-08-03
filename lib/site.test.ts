import { describe, expect, it, afterEach } from 'vitest'
import {
  appOrigin,
  authCallbackUrl,
  isEphemeralVercelDeploymentHost,
} from '@/lib/site'

const ORIGINAL = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('appOrigin / authCallbackUrl', () => {
  it('uses NEXT_PUBLIC_APP_URL when set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://club.example.com/'
    delete process.env.VERCEL_URL
    delete process.env.VERCEL_ENV
    expect(appOrigin()).toBe('https://club.example.com')
    expect(authCallbackUrl('/login')).toBe(
      'https://club.example.com/auth/callback?next=%2Flogin'
    )
  })

  it('defaults to localhost in non-deployed environments', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.SITE_URL
    delete process.env.APP_URL
    delete process.env.VERCEL_URL
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    process.env.NODE_ENV = 'development'
    expect(appOrigin()).toBe('http://localhost:3000')
  })

  it('rejects localhost NEXT_PUBLIC_APP_URL when deployed', () => {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    expect(() => appOrigin()).toThrow(/must not point at localhost/i)
  })

  it('requires NEXT_PUBLIC_APP_URL or production fallback when Vercel production', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.SITE_URL
    delete process.env.APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    process.env.VERCEL_URL = 'huntsville-social-club-8n04fj8qe.vercel.app'
    expect(() => appOrigin()).toThrow(/NEXT_PUBLIC_APP_URL is required/i)
  })

  it('uses VERCEL_PROJECT_PRODUCTION_URL in production when APP_URL unset', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.SITE_URL
    delete process.env.APP_URL
    process.env.VERCEL_PROJECT_PRODUCTION_URL =
      'huntsville-social-club-app.vercel.app'
    process.env.VERCEL_URL = 'huntsville-social-club-8n04fj8qe.vercel.app'
    expect(appOrigin()).toBe('https://huntsville-social-club-app.vercel.app')
  })

  it('never uses ephemeral VERCEL_URL for production Stripe/auth origins', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL =
      'https://huntsville-social-club-8n04fj8qe.vercel.app'
    process.env.VERCEL_PROJECT_PRODUCTION_URL =
      'huntsville-social-club-app.vercel.app'
    expect(appOrigin()).toBe('https://huntsville-social-club-app.vercel.app')
  })

  it('allows VERCEL_URL fallback on preview deployments', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.SITE_URL
    delete process.env.APP_URL
    process.env.VERCEL_URL = 'huntsville-social-club-8n04fj8qe.vercel.app'
    expect(appOrigin()).toBe(
      'https://huntsville-social-club-8n04fj8qe.vercel.app'
    )
  })
})

describe('isEphemeralVercelDeploymentHost', () => {
  it('detects deployment and git hosts', () => {
    expect(
      isEphemeralVercelDeploymentHost(
        'https://huntsville-social-club-8n04fj8qe.vercel.app'
      )
    ).toBe(true)
    expect(
      isEphemeralVercelDeploymentHost(
        'huntsville-social-club-app-git-main-team.vercel.app'
      )
    ).toBe(true)
  })

  it('allows stable production aliases', () => {
    expect(
      isEphemeralVercelDeploymentHost(
        'https://huntsville-social-club-app.vercel.app'
      )
    ).toBe(false)
    expect(isEphemeralVercelDeploymentHost('https://club.example.com')).toBe(
      false
    )
  })
})
