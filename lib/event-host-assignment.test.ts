import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canViewEventAttendeeRoster } from '@/lib/event-paid-guest-roster'
import { canViewerReadRsvpAnswer } from '@/lib/event-rsvp-question'
import {
  EVENT_HOST_ROWS_MISSING_MESSAGE,
  additionalHostLabel,
  additionalHostSelectionError,
  additionalHostsAfterPrimaryChange,
  decideHostAssignment,
  effectivePrimaryHostId,
  escapeHostSearchQuery,
  eventDisplayHostId,
  interpretEventHostLoad,
  isHostingEnabledMember,
  isMissingEventHostSchemaError,
  normalizeHostSearchQuery,
  primaryHostLabel,
  visibleAdditionalHostIds,
  type HostCandidate,
} from '@/lib/event-host-assignment'

const adminSaveWrites = vi.hoisted(() => ({
  eventUpdates: 0,
  rpcs: [] as string[],
  primaryRows: [] as { id: string; primary_host_id: string | null }[],
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/viewer', () => ({
  getViewer: async () => ({
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'avery@example.com',
    role: 'admin',
    applicationStatus: 'approved',
    canAccessApp: true,
    profile: { full_name: 'Avery Admin' },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from(table: string) {
      if (table === 'event_additional_hosts') {
        return {
          select() {
            return {
              in() {
                return {
                  order: async () => ({ data: [], error: null }),
                }
              },
            }
          },
        }
      }
      if (table !== 'events') {
        throw new Error(`unexpected table ${table}`)
      }
      return {
        select(columns: string) {
          if (columns === 'id, primary_host_id') {
            return {
              in: async () => ({
                data: adminSaveWrites.primaryRows,
                error: null,
              }),
            }
          }
          return {
            eq() {
              return {
                single: async () => ({
                  data: {
                    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    owner_id: '22222222-2222-4222-8222-222222222222',
                    event_type: 'standard_event',
                    status: 'published',
                    visibility: 'public',
                  },
                  error: null,
                }),
              }
            },
          }
        },
        update() {
          adminSaveWrites.eventUpdates += 1
          return { eq: async () => ({ error: null }) }
        },
      }
    },
    rpc(name: string) {
      adminSaveWrites.rpcs.push(name)
      return Promise.resolve({ data: null, error: null })
    },
  }),
}))

const OWNER = '11111111-1111-4111-8111-111111111111'
const HOST = '22222222-2222-4222-8222-222222222222'
const COHOST = '33333333-3333-4333-8333-333333333333'
const MEMBER = '44444444-4444-4444-8444-444444444444'
const REMOVED_HOST = '55555555-5555-4555-8555-555555555555'

const candidates: HostCandidate[] = [
  { id: HOST, fullName: 'Riley Host', role: 'host', removedAt: null },
  { id: COHOST, fullName: 'Casey CoHost', role: 'host', removedAt: null },
  { id: OWNER, fullName: 'Avery Admin', role: 'admin', removedAt: null },
  { id: MEMBER, fullName: 'Morgan Member', role: 'member', removedAt: null },
  {
    id: REMOVED_HOST,
    fullName: 'Removed Host',
    role: 'host',
    removedAt: '2026-11-01T00:00:00Z',
  },
]

describe('event host assignment decisions', () => {
  it('replaces the primary host with another hosting-enabled member', () => {
    const decision = decideHostAssignment({
      actorRole: 'admin',
      currentPrimaryHostId: OWNER,
      nextPrimaryHostId: HOST,
      nextAdditionalHostIds: [],
      candidates,
    })

    expect(decision).toEqual({
      ok: true,
      primaryHostId: HOST,
      additionalHostIds: [],
    })
  })

  it('adds and removes additional hosts without changing the primary host', () => {
    const added = decideHostAssignment({
      actorRole: 'admin',
      currentPrimaryHostId: OWNER,
      nextPrimaryHostId: OWNER,
      nextAdditionalHostIds: [HOST, COHOST],
      candidates,
    })
    expect(added).toEqual({
      ok: true,
      primaryHostId: OWNER,
      additionalHostIds: [HOST, COHOST],
    })

    const removed = decideHostAssignment({
      actorRole: 'admin',
      currentPrimaryHostId: OWNER,
      nextPrimaryHostId: OWNER,
      nextAdditionalHostIds: [COHOST],
      candidates,
    })
    expect(removed).toEqual({
      ok: true,
      primaryHostId: OWNER,
      additionalHostIds: [COHOST],
    })
  })

  it('keeps an existing member creator as primary host when the assignment is unchanged', () => {
    const decision = decideHostAssignment({
      actorRole: 'admin',
      currentPrimaryHostId: MEMBER,
      nextPrimaryHostId: MEMBER,
      nextAdditionalHostIds: [],
      candidates,
    })

    expect(decision).toEqual({
      ok: true,
      primaryHostId: MEMBER,
      additionalHostIds: [],
    })
  })

  it('rejects a new primary host who does not have hosting abilities', () => {
    expect(
      decideHostAssignment({
        actorRole: 'admin',
        currentPrimaryHostId: OWNER,
        nextPrimaryHostId: MEMBER,
        nextAdditionalHostIds: [],
        candidates,
      })
    ).toEqual({
      ok: false,
      error: 'The primary host must be a member with hosting abilities.',
    })
    expect(isHostingEnabledMember(candidates.find((row) => row.id === MEMBER))).toBe(
      false
    )
    expect(
      isHostingEnabledMember(candidates.find((row) => row.id === REMOVED_HOST))
    ).toBe(false)
  })

  it('rejects duplicate and ineligible additional hosts', () => {
    expect(
      decideHostAssignment({
        actorRole: 'admin',
        currentPrimaryHostId: OWNER,
        nextPrimaryHostId: OWNER,
        nextAdditionalHostIds: [HOST, HOST],
        candidates,
      })
    ).toMatchObject({ ok: false })

    expect(
      decideHostAssignment({
        actorRole: 'admin',
        currentPrimaryHostId: OWNER,
        nextPrimaryHostId: HOST,
        nextAdditionalHostIds: [HOST],
        candidates,
      }).ok
    ).toBe(false)

    expect(
      decideHostAssignment({
        actorRole: 'admin',
        currentPrimaryHostId: OWNER,
        nextPrimaryHostId: OWNER,
        nextAdditionalHostIds: [MEMBER],
        candidates,
      }).ok
    ).toBe(false)

    expect(
      decideHostAssignment({
        actorRole: 'admin',
        currentPrimaryHostId: OWNER,
        nextPrimaryHostId: OWNER,
        nextAdditionalHostIds: [REMOVED_HOST],
        candidates,
      }).ok
    ).toBe(false)
  })

  it('keeps a host who lost hosting abilities when the assignment is unchanged', () => {
    const demoted = decideHostAssignment({
      actorRole: 'admin',
      currentPrimaryHostId: HOST,
      currentAdditionalHostIds: [COHOST],
      nextPrimaryHostId: HOST,
      nextAdditionalHostIds: [COHOST],
      candidates: [],
    })
    expect(demoted).toEqual({
      ok: true,
      primaryHostId: HOST,
      additionalHostIds: [COHOST],
    })

    expect(
      decideHostAssignment({
        actorRole: 'admin',
        currentPrimaryHostId: OWNER,
        currentAdditionalHostIds: [],
        nextPrimaryHostId: HOST,
        nextAdditionalHostIds: [],
        candidates: [{ id: HOST, fullName: 'Riley Host', role: 'member', removedAt: null }],
      })
    ).toMatchObject({ ok: false })
  })

  it('treats a cleared primary as the creator without assigning that member', () => {
    expect(
      eventDisplayHostId({ owner_id: MEMBER, primary_host_id: null })
    ).toBe(MEMBER)
    expect(
      decideHostAssignment({
        actorRole: 'admin',
        currentPrimaryHostId: MEMBER,
        nextPrimaryHostId: MEMBER,
        nextAdditionalHostIds: [HOST],
        currentAdditionalHostIds: [HOST],
        candidates: [],
      })
    ).toEqual({
      ok: true,
      primaryHostId: MEMBER,
      additionalHostIds: [HOST],
    })
  })

  it('rejects host assignment from anyone who is not an admin', () => {
    for (const actorRole of ['host', 'member', null]) {
      expect(
        decideHostAssignment({
          actorRole,
          currentPrimaryHostId: OWNER,
          nextPrimaryHostId: HOST,
          nextAdditionalHostIds: [COHOST],
          candidates,
        })
      ).toEqual({
        ok: false,
        error: 'You do not have permission to assign event hosts.',
      })
    }
  })
})

describe('event host load errors', () => {
  const events = [{ id: 'event-1', owner_id: OWNER }]

  it('shows the creator when the host columns are not migrated yet', () => {
    const loaded = interpretEventHostLoad({
      events,
      primaryError: {
        message: 'column events.primary_host_id does not exist',
        code: '42703',
      },
      primaryRows: null,
      additionalError: null,
      additionalRows: [],
    })

    expect(loaded.schemaReady).toBe(false)
    expect(loaded.loadError).toBeNull()
    expect(loaded.byEventId['event-1']).toEqual({
      rawPrimaryHostId: null,
      primaryHostId: OWNER,
      additionalHostIds: [],
    })
  })

  it('does not turn an unrelated database error into an empty host list', () => {
    const loaded = interpretEventHostLoad({
      events,
      primaryError: { message: 'connection refused', code: '08006' },
      primaryRows: null,
      additionalError: null,
      additionalRows: [],
    })

    expect(loaded.schemaReady).toBe(false)
    expect(loaded.loadError).toBe('connection refused')
    expect(loaded.byEventId).toEqual({})
    expect(
      isMissingEventHostSchemaError({
        message: 'connection refused',
        code: '08006',
      })
    ).toBe(false)
    expect(
      isMissingEventHostSchemaError({
        message: 'Could not find the function public.assign_event_hosts in the schema cache',
      })
    ).toBe(true)
  })

  it('keeps a stored host id after that member loses hosting abilities', () => {
    const loaded = interpretEventHostLoad({
      events,
      primaryError: null,
      primaryRows: [{ id: 'event-1', primary_host_id: HOST }],
      additionalError: null,
      additionalRows: [
        { event_id: 'event-1', profile_id: COHOST, sort_order: 1 },
        { event_id: 'event-1', profile_id: MEMBER, sort_order: 0 },
      ],
    })

    expect(loaded).toEqual({
      schemaReady: true,
      loadError: null,
      byEventId: {
        'event-1': {
          rawPrimaryHostId: HOST,
          primaryHostId: HOST,
          additionalHostIds: [MEMBER, COHOST],
        },
      },
    })
  })

  it('falls back to the creator only when the stored primary host is null', () => {
    const loaded = interpretEventHostLoad({
      events: [{ id: 'event-1', owner_id: MEMBER }],
      primaryError: null,
      primaryRows: [{ id: 'event-1', primary_host_id: null }],
      additionalError: null,
      additionalRows: [{ event_id: 'event-1', profile_id: HOST, sort_order: 0 }],
    })

    expect(loaded.byEventId['event-1']).toEqual({
      rawPrimaryHostId: null,
      primaryHostId: MEMBER,
      additionalHostIds: [HOST],
    })
  })

  it('returns a load error when the primary-host query is empty', () => {
    const loaded = interpretEventHostLoad({
      events,
      primaryError: null,
      primaryRows: [],
      additionalError: null,
      additionalRows: [],
    })

    expect(loaded).toEqual({
      schemaReady: false,
      loadError: EVENT_HOST_ROWS_MISSING_MESSAGE,
      byEventId: {},
    })
  })

  it('returns a load error when only some requested events have rows', () => {
    const loaded = interpretEventHostLoad({
      events: [
        { id: 'event-1', owner_id: OWNER },
        { id: 'event-2', owner_id: HOST },
      ],
      primaryError: null,
      primaryRows: [{ id: 'event-1', primary_host_id: null }],
      additionalError: null,
      additionalRows: [],
    })

    expect(loaded.schemaReady).toBe(false)
    expect(loaded.loadError).toBe(EVENT_HOST_ROWS_MISSING_MESSAGE)
    expect(loaded.byEventId).toEqual({})
  })
})

describe('create-form creator fallback', () => {
  it('treats a cleared primary host as the creator and removes that overlap', () => {
    expect(
      effectivePrimaryHostId({
        selectedPrimaryHostId: null,
        creatorId: OWNER,
      })
    ).toBe(OWNER)
    expect(
      effectivePrimaryHostId({
        selectedPrimaryHostId: HOST,
        creatorId: OWNER,
      })
    ).toBe(HOST)
    expect(
      additionalHostSelectionError({
        hostId: OWNER,
        selectedPrimaryHostId: null,
        creatorId: OWNER,
        additionalHostIds: [],
      })
    ).toBe('The primary host cannot also be an additional host.')
    expect(
      additionalHostsAfterPrimaryChange(
        [
          { id: OWNER, fullName: 'Avery Admin' },
          { id: COHOST, fullName: 'Casey CoHost' },
        ],
        OWNER
      ).map((host) => host.id)
    ).toEqual([COHOST])
  })
})

describe('event host display', () => {
  const profiles = {
    [HOST]: { full_name: 'Riley Host' },
    [COHOST]: { full_name: 'Casey CoHost' },
  }

  it('shows the saved primary host and falls back to the creator when unset', () => {
    expect(
      eventDisplayHostId({ owner_id: OWNER, primary_host_id: HOST })
    ).toBe(HOST)
    expect(eventDisplayHostId({ owner_id: OWNER, primary_host_id: null })).toBe(
      OWNER
    )
    expect(eventDisplayHostId({ owner_id: OWNER })).toBe(OWNER)
  })

  it('uses the primary host name on cards and the event page', () => {
    expect(
      primaryHostLabel({
        hostId: HOST,
        viewerId: MEMBER,
        profile: profiles[HOST],
        style: 'card',
      })
    ).toBe('Riley Host')
    expect(
      primaryHostLabel({
        hostId: HOST,
        viewerId: HOST,
        profile: profiles[HOST],
        style: 'sentence',
      })
    ).toBe('you')
    expect(
      additionalHostLabel({
        hostIds: visibleAdditionalHostIds(HOST, [HOST, COHOST, COHOST]),
        viewerId: MEMBER,
        profilesById: profiles,
      })
    ).toBe('Casey CoHost')
  })
})

describe('host search input', () => {
  it('requires a short name and escapes like-pattern characters', () => {
    expect(normalizeHostSearchQuery(' r ')).toMatchObject({ error: expect.any(String) })
    expect(normalizeHostSearchQuery('  Riley   Host ')).toEqual({ query: 'Riley Host' })
    expect(escapeHostSearchQuery('100%_host\\')).toBe('100\\%\\_host\\\\')
  })
})

describe('host assignment does not grant event management', () => {
  it('leaves roster and RSVP-answer access with the owner and admins', () => {
    expect(
      canViewEventAttendeeRoster({
        viewerId: COHOST,
        eventOwnerId: OWNER,
        role: 'host',
      })
    ).toBe(false)
    expect(
      canViewEventAttendeeRoster({
        viewerId: OWNER,
        eventOwnerId: OWNER,
        role: 'member',
      })
    ).toBe(true)
    expect(
      canViewerReadRsvpAnswer({
        viewerUserId: COHOST,
        attendeeUserId: MEMBER,
        isEventOwner: false,
        isAdmin: false,
      })
    ).toBe(false)
    expect(
      canViewerReadRsvpAnswer({
        viewerUserId: OWNER,
        attendeeUserId: MEMBER,
        isEventOwner: true,
        isAdmin: false,
      })
    ).toBe(true)
  })
})

describe('host assignment boundaries in source', () => {
  const root = process.cwd()
  const migration = readFileSync(
    join(root, 'supabase/migrations/20261112140000_event_host_assignment.sql'),
    'utf8'
  )
  const actions = readFileSync(join(root, 'app/(club)/events/actions.ts'), 'utf8')
  const store = readFileSync(join(root, 'lib/event-host-store.ts'), 'utf8')
  const approval = readFileSync(
    join(root, 'supabase/migrations/20260727000000_events_rls_approval_hardening.sql'),
    'utf8'
  )
  const editForm = readFileSync(
    join(root, 'app/(club)/events/event-edit-form.tsx'),
    'utf8'
  )
  const hostFields = readFileSync(
    join(root, 'components/events/event-host-assignment-fields.tsx'),
    'utf8'
  )
  const detailPage = readFileSync(
    join(root, 'app/(club)/events/[id]/page.tsx'),
    'utf8'
  )

  it('backfills the primary host from the creator and does not replace approval or ownership policies', () => {
    expect(migration).toContain('set primary_host_id = owner_id')
    expect(migration).toContain('Only admins can change the primary host')
    expect(migration).toContain('Primary host must have hosting abilities')
    expect(migration).toContain('Only admins can assign additional hosts')
    expect(migration).toContain('That member is already the primary host')
    expect(migration).not.toContain('events_enforce_approval_gates')
    expect(migration).not.toContain('new.owner_id :=')
    expect(migration).not.toContain('new.owner_id =')
    expect(migration).not.toContain('set owner_id')
    expect(migration).not.toMatch(/drop policy[\s\S]{0,180}on public\.events/i)
    expect(migration).toContain('assign_event_hosts')
    expect(migration).toContain('hsc.releasing_deleted_profile_host')
    expect(migration).toContain('event_host_release_owner_executing')
    expect(migration).toContain('pg_trigger_depth() > 1')
    expect(migration).not.toContain(
      "current_setting('hsc.releasing_deleted_profile_host', true) = '1' then"
    )
    expect(migration).toContain('Does not grant edit')
  })

  it('saves event fields and host ids in one call without rewriting the creator', () => {
    expect(actions).toContain('owner_id: viewer.userId')
    expect(actions).toContain('createEventWithHosts')
    expect(actions).toContain('updateEventWithHosts')
    expect(actions).not.toContain('saveEventHostAssignment')
    expect(actions).not.toContain(".from('events').delete()")
    expect(actions).not.toContain('replaceEventAdditionalHosts')
    expect(actions).not.toContain('primary_host_id: hostPlan.primaryHostId')
    expect(actions).not.toContain('owner_id: hostPlan')
    expect(actions).not.toContain('owner_id: input.primaryHostId')
    expect(store).toContain("'create_event_with_hosts'")
    expect(store).toContain("'update_event_with_hosts'")
    expect(migration).toContain('create_event_with_hosts')
    expect(migration).toContain('update_event_with_hosts')
    expect(migration).not.toContain('delete from public.events')
    expect(actions).toContain('You do not have permission to assign event hosts.')
    expect(actions).toContain("status = 'pending_approval'")
  })

  it('leaves the existing host and admin publication path unchanged', () => {
    expect(approval).toContain('if public.is_host_or_admin(auth.uid()) then')
    expect(approval).toContain('return new;')
    expect(actions).toContain("return role === 'admin' || role === 'host'")
    expect(actions).toContain("const requestedStatus = input.status?.trim() || 'published'")
  })

  it('selects hosting members in the admin editor and keeps management on the creator', () => {
    expect(editForm).toContain('EventHostAssignmentFields')
    expect(editForm).toContain('isAdminEditor')
    expect(hostFields).toContain('Search hosting members')
    expect(hostFields).not.toContain('placeholder="Host name"')
    expect(detailPage).toContain('event.owner_id')
    expect(detailPage).toContain('canManageEvent = user.id === event.owner_id || userRole === \'admin\'')
    expect(detailPage).toContain('eventOwnerId: event.owner_id')
    expect(detailPage).toContain('Hosted by {primaryLabel}')
    expect(hostFields).toContain('additionalHostSelectionError')
    expect(hostFields).toContain('additionalHostsAfterPrimaryChange')
    expect(hostFields).toContain('useCreator')
    const createForm = readFileSync(
      join(root, 'app/(club)/events/event-form.tsx'),
      'utf8'
    )
    const eventsPage = readFileSync(join(root, 'app/(club)/events/page.tsx'), 'utf8')
    expect(createForm).toContain('creator={creator}')
    expect(eventsPage).toContain('id: viewer.userId')
    expect(eventsPage).toContain('fullName: viewer.profile?.full_name?.trim() ?? \'\'')
  })
})

describe('admin save when primary-host rows are missing', () => {
  const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

  beforeEach(() => {
    adminSaveWrites.eventUpdates = 0
    adminSaveWrites.rpcs = []
    adminSaveWrites.primaryRows = []
  })

  async function save() {
    const { updateEvent } = await import('@/app/(club)/events/actions')
    return updateEvent({
      eventId,
      title: 'Mixer',
      location: 'Downtown',
      startsAt: '2026-12-01T18:00',
      description: 'Evening',
    })
  }

  it('stops an empty primary-host result before writing the event', async () => {
    adminSaveWrites.primaryRows = []
    const result = await save()
    expect(result).toEqual({ error: EVENT_HOST_ROWS_MISSING_MESSAGE })
    expect(adminSaveWrites.eventUpdates).toBe(0)
    expect(adminSaveWrites.rpcs).toEqual([])
  })

  it('stops a partial primary-host result before writing the event', async () => {
    adminSaveWrites.primaryRows = [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        primary_host_id: null,
      },
    ]
    const result = await save()
    expect(result).toEqual({ error: EVENT_HOST_ROWS_MISSING_MESSAGE })
    expect(adminSaveWrites.eventUpdates).toBe(0)
    expect(adminSaveWrites.rpcs).toEqual([])
  })
})
