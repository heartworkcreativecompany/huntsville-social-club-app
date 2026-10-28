import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requestCuratedIntro } from '@/app/(club)/members/intro-actions'
import {
  approveCuratedIntroRequest,
  declineCuratedIntroRequestAction,
} from '@/app/(club)/admin/curated-intros/actions'
import {
  declineCuratedIntroRequest,
  matchCuratedIntroRequest,
  STAFF_INTRO_REVIEW_RETIRED,
} from '@/lib/curated-intro-admin'
import {
  notifyCuratedIntroDeclined,
  notifyCuratedIntroMatched,
} from '@/lib/curated-intro-notifications'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const repoRoot = join(__dirname, '..')

function source(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('staff intro retirement', () => {
  it('refuses a direct concierge intro submission without writing a request', async () => {
    const result = await requestCuratedIntro('Please introduce me')
    expect(result).toEqual({
      error:
        'Concierge intro requests are turned off. Send a message request from a recommendation or member profile.',
    })

    const actions = source('app/(club)/members/intro-actions.ts')
    const submission = actions.slice(
      actions.indexOf('export async function requestCuratedIntro'),
      actions.indexOf('export async function requestMemberIntro')
    )
    expect(submission).not.toMatch(/\.insert\(|member_intro_requests/)
  })

  it('does not send email or change rows from retired intro actions', async () => {
    const approval = await approveCuratedIntroRequest('request-1')
    const decline = await declineCuratedIntroRequestAction('request-1', 'no')
    expect(approval.error).toMatch(/retired/i)
    expect(decline.error).toMatch(/retired/i)

    const adminActions = source('app/(club)/admin/curated-intros/actions.ts')
    expect(adminActions).not.toMatch(/sendCuratedIntro|matchCuratedIntroRequest|declineCuratedIntroRequest\(/)

    const touched = {
      from: false,
    }
    const supabase = new Proxy(
      {},
      {
        get() {
          touched.from = true
          throw new Error('retired intro review must not query the database')
        },
      }
    ) as SupabaseClient<Database>

    const matched = await matchCuratedIntroRequest(supabase, 'request-1')
    const declined = await declineCuratedIntroRequest(supabase, 'request-1')
    expect(matched).toEqual({ ok: false, error: STAFF_INTRO_REVIEW_RETIRED })
    expect(declined).toEqual({ ok: false, error: STAFF_INTRO_REVIEW_RETIRED })
    expect(touched.from).toBe(false)

    await notifyCuratedIntroMatched(supabase, {
      introRequestId: 'request-1',
      conversationId: 'conversation-1',
      requesterId: 'member-a',
      targetMemberId: 'member-b',
    })
    await notifyCuratedIntroDeclined(supabase, {
      introRequestId: 'request-1',
      requesterId: 'member-a',
      targetMemberId: 'member-b',
    })
    expect(touched.from).toBe(false)

    expect(source('lib/curated-intro-notifications.ts')).not.toMatch(
      /sendCuratedIntro|transactional-email/
    )
    expect(source('lib/message-request-notifications.ts')).not.toMatch(
      /sendCuratedIntro|paid membership is required/i
    )
    expect(source('lib/curated-intro-admin.ts')).not.toMatch(/\.update\(|\.insert\(/)
  })

  it('keeps Circle generation, Friendship refresh, and holdover expiry on the Monday job', () => {
    const cron = source('app/api/cron/curated-matches/route.ts')
    expect(cron).toContain('expireDueConnectHoldoverMatching')
    expect(cron).toContain('friendshipCronShouldRefresh')
    expect(cron).toContain('refreshFriendshipRecommendationsForAllEligible')
    expect(cron).toContain('runScheduledCuratedMatchDelivery')
    expect(cron).not.toContain('matchCuratedIntroRequest')
  })

  it('routes recommendation messaging through the identity request path', () => {
    const matches = source('app/(club)/matches/actions.ts')
    const request = matches.slice(
      matches.indexOf('export async function requestCuratedMatchIntro'),
      matches.indexOf('export async function passCuratedRecommendation')
    )
    expect(request).toContain('sendMessageRequest')
    expect(request).not.toContain('canMessage')
    expect(request).not.toContain('acceptMessageRequest')

    const requests = source('lib/message-request-flow.ts')
    expect(requests).toContain("status: 'pending'")
    expect(source('lib/require-messaging.ts')).toContain('assertCanStartMessageRequest')
    expect(source('components/matches/curated-match-intro-button.tsx')).toContain(
      'identityStatus !== \'verified\''
    )
    expect(source('components/matches/curated-match-intro-button.tsx')).not.toContain(
      'An active paid membership is required'
    )
    expect(source('app/(club)/dashboard/page.tsx')).not.toContain('entitlements?.canMessage')
    expect(source('lib/membership-entitlements.ts')).toContain('canUseCuratedMatching')
    expect(source('lib/membership-entitlements.ts')).toMatch(/const canMessage =/)
  })
})
