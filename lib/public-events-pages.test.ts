import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { memberEventRsvpHref, publicMarketingSignupHref } from '@/components/marketing/public-marketing-frame'
import { portalCtaHref } from '@/lib/hostnames'

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

const PUBLIC_FILES = [
  'lib/load-public-events.ts',
  'lib/supabase/anonymous.ts',
  'app/(marketing)/public-events/page.tsx',
  'app/(marketing)/public-events/[id]/page.tsx',
  'components/marketing/public-marketing-frame.tsx',
]

describe('public calendar data access', () => {
  it('uses a cookie-less anon client and never the session client or service role', () => {
    const loader = readRepoFile('lib/load-public-events.ts')
    const anonymous = readRepoFile('lib/supabase/anonymous.ts')

    expect(loader).toContain("from '@/lib/supabase/anonymous'")
    expect(loader).not.toContain("from '@/lib/supabase/server'")
    expect(loader).not.toContain("from '@/lib/supabase/admin'")
    expect(anonymous).toContain('persistSession: false')
    expect(anonymous).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(anonymous).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(anonymous).not.toContain('cookies(')
    expect(anonymous).not.toContain('request.cookies')
    expect(anonymous).not.toContain("from '@/lib/supabase/server'")
    expect(anonymous).not.toContain("from '@/lib/supabase/admin'")
  })

  it('does not query member, attendee, ledger, entitlement, or sponsor tables', () => {
    const combined = PUBLIC_FILES.map(readRepoFile).join('\n')
    for (const table of [
      'event_attendees',
      'member_profiles',
      'event_registration_ledger',
      'membership_entitlement_cycles',
      'event_sponsorships',
      'event_sponsors',
      'sponsors',
    ]) {
      expect(combined).not.toContain(table)
    }
    expect(combined).not.toMatch(/select\(\s*['"`]\*/)
  })
})

describe('public calendar pages', () => {
  it('lists upcoming events without host names, attendee counts, or spots left', () => {
    const page = readRepoFile('app/(marketing)/public-events/page.tsx')
    expect(page).toContain('loadUpcomingPublicEvents')
    expect(page).toContain('eventCoverImage')
    expect(page).toContain('EventTypeBadge')
    expect(page).toContain('formatEventScheduleInChicago')
    expect(page).toContain('publicEventDetailHref')
    expect(page).toContain('ApplyMembershipCta')
    expect(page).toContain('No upcoming events')
    expect(page).not.toContain('attendance_max')
    expect(page).not.toContain('spots')
    expect(page).not.toContain('owner')
    expect(page).not.toContain('host')
    expect(page).not.toContain('attendee')
    expect(page).not.toContain('rsvp_question')
    expect(page).not.toContain('result.error}')
  })

  it('shows one public event and points members at the members host to RSVP', () => {
    const page = readRepoFile('app/(marketing)/public-events/[id]/page.tsx')
    expect(page).toContain('loadPublicEvent')
    expect(page).toContain('notFound()')
    expect(page).toContain('EventDescription')
    expect(page).toContain('Members: sign in to RSVP')
    expect(page).toContain('Apply for membership')
    expect(page).toContain('formatEventScheduleInChicago')
    expect(page).toContain('publicEventPriceLabel')
    expect(page).not.toContain('dangerouslySetInnerHTML')
    expect(page).not.toContain('attendance_max')
    expect(page).not.toContain('spots left')
    expect(page).not.toContain('rsvp_question')
    expect(page).not.toContain('event_attendees')
    expect(memberEventRsvpHref('abc-123')).toBe(
      'https://members.huntsvillesocialclub.com/events/abc-123'
    )
    expect(publicMarketingSignupHref()).toBe(portalCtaHref('marketing', '/signup'))
  })
})

describe('member calendar stays behind login', () => {
  it('still redirects signed-out visitors and renders the member calendar', () => {
    const layout = readRepoFile('app/(club)/layout.tsx')
    const list = readRepoFile('app/(club)/events/page.tsx')
    const detail = readRepoFile('app/(club)/events/[id]/page.tsx')

    expect(layout).toContain("redirect('/login')")
    expect(list).toContain("redirect('/login')")
    expect(list).toContain("redirect('/application')")
    expect(list).toContain('EventsBrowser')
    expect(detail).toContain("redirect('/login')")
    expect(detail).toContain("redirect('/application')")
  })

  it('keeps member event dates on the start-only Chicago formatter', () => {
    const listCard = readRepoFile('components/events/event-list-card.tsx')
    const richCard = readRepoFile('components/events/event-rich-card.tsx')
    const detail = readRepoFile('app/(club)/events/[id]/page.tsx')

    for (const source of [listCard, richCard, detail]) {
      expect(source).toContain('formatEventDate(event.starts_at)')
      expect(source).not.toContain('formatEventScheduleInChicago')
      expect(source).not.toContain('publicEventScheduleLabel')
    }
  })
})

describe('marketing rewrite wiring', () => {
  it('rewrites marketing /events inside the proxy and preserves the rewrite response', () => {
    const proxy = readRepoFile('proxy.ts')
    const session = readRepoFile('lib/supabase/middleware.ts')
    expect(proxy).toContain('proxyPublicEventsRewrite')
    expect(proxy).toContain('NextResponse.rewrite')
    expect(proxy).toContain('updateSession(request, rewriteResponse)')
    expect(session).toContain('responseOverride')
  })
})
