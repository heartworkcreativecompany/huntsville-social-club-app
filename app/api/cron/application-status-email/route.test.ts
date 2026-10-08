import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const ORIGINAL_ENV = {
  CRON_SECRET: process.env.CRON_SECRET,
  APPLICATION_STATUS_RETRY_SECRET: process.env.APPLICATION_STATUS_RETRY_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
}

afterEach(() => {
  vi.unstubAllGlobals()
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function authorize(secret = 'cron-secret') {
  return new Request('http://localhost/api/cron/application-status-email', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('application status email cron', () => {
  it('does not call the function when the cron secret is missing or wrong', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.CRON_SECRET
    process.env.APPLICATION_STATUS_RETRY_SECRET = 'retry-secret'
    process.env.SUPABASE_URL = 'https://example.supabase.co'

    const missing = await GET(
      new Request('http://localhost/api/cron/application-status-email')
    )
    expect(missing.status).toBe(401)

    process.env.CRON_SECRET = 'cron-secret'
    const wrong = await GET(authorize('other-secret'))
    expect(wrong.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the retry secret is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    process.env.CRON_SECRET = 'cron-secret'
    delete process.env.APPLICATION_STATUS_RETRY_SECRET
    process.env.SUPABASE_URL = 'https://example.supabase.co'

    const response = await GET(authorize())
    expect(response.status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the retry header to the edge function without the webhook secret', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    process.env.CRON_SECRET = 'cron-secret'
    process.env.APPLICATION_STATUS_RETRY_SECRET = 'retry-secret'
    process.env.SUPABASE_URL = 'https://example.supabase.co'

    const response = await GET(authorize())
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://example.supabase.co/functions/v1/application-status-email'
    )
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['x-application-status-retry-secret']).toBe('retry-secret')
    expect(JSON.stringify(headers)).not.toContain('cron-secret')
    expect(headers.authorization).toBeUndefined()
  })
})
