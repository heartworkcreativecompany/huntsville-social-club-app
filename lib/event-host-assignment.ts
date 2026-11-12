/**
 * Event host names are member identities, separate from event ownership.
 *
 * owner_id is the creator and the only non-admin event manager. primary_host_id
 * is the name shown as the primary host. event_additional_hosts are extra names.
 * Neither host field grants edit, publish, roster, RSVP-answer, guest, refund,
 * or notification rights. Admins keep that access through their role; the
 * creator keeps it through owner_id.
 */

export const MAX_ADDITIONAL_HOSTS = 20

const HOST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type HostCandidate = {
  id: string
  fullName: string | null
  role: string | null
  removedAt?: string | null
}

export type AssignedHost = {
  id: string
  fullName: string
}

export type HostAssignmentDecision =
  | {
      ok: true
      primaryHostId: string
      additionalHostIds: string[]
    }
  | { ok: false; error: string }

export function isHostingEnabledMember(
  candidate: Pick<HostCandidate, 'role' | 'removedAt'> | null | undefined
): boolean {
  if (!candidate || candidate.removedAt) return false
  return candidate.role === 'host' || candidate.role === 'admin'
}

export function isEventHostId(value: string | null | undefined): value is string {
  return typeof value === 'string' && HOST_ID_PATTERN.test(value.trim())
}

export function eventDisplayHostId(event: {
  owner_id: string
  primary_host_id?: string | null
}): string {
  const primary = event.primary_host_id?.trim()
  return primary || event.owner_id
}

export function visibleAdditionalHostIds(
  primaryHostId: string,
  additionalHostIds: readonly string[]
): string[] {
  const seen = new Set<string>()
  const visible: string[] = []
  for (const hostId of additionalHostIds) {
    if (!hostId || hostId === primaryHostId || seen.has(hostId)) continue
    seen.add(hostId)
    visible.push(hostId)
  }
  return visible
}

export function profileHostName(
  profile: { full_name: string | null } | undefined
): string {
  if (!profile) return 'Unknown member'
  const name = profile.full_name?.trim()
  return name || 'Member'
}

export function primaryHostLabel(input: {
  hostId: string
  viewerId: string
  profile: { full_name: string | null } | undefined
  style: 'card' | 'sentence'
}): string {
  if (input.hostId === input.viewerId) {
    return input.style === 'card' ? 'You' : 'you'
  }
  return profileHostName(input.profile)
}

export function additionalHostLabel(input: {
  hostIds: readonly string[]
  viewerId: string
  profilesById: Record<string, { full_name: string | null } | undefined>
}): string {
  return input.hostIds
    .map((hostId) =>
      primaryHostLabel({
        hostId,
        viewerId: input.viewerId,
        profile: input.profilesById[hostId],
        style: 'card',
      })
    )
    .join(', ')
}

export function effectivePrimaryHostId(input: {
  selectedPrimaryHostId?: string | null
  creatorId?: string | null
}): string | null {
  const selected = input.selectedPrimaryHostId?.trim()
  if (selected) return selected
  const creator = input.creatorId?.trim()
  return creator || null
}

export function additionalHostsAfterPrimaryChange<T extends { id: string }>(
  hosts: readonly T[],
  nextPrimaryHostId: string | null | undefined
): T[] {
  if (!nextPrimaryHostId) return [...hosts]
  return hosts.filter((host) => host.id !== nextPrimaryHostId)
}

export function additionalHostSelectionError(input: {
  hostId: string
  selectedPrimaryHostId?: string | null
  creatorId?: string | null
  additionalHostIds: readonly string[]
}): string | null {
  const effective = effectivePrimaryHostId(input)
  if (effective && input.hostId === effective) {
    return 'The primary host cannot also be an additional host.'
  }
  if (input.additionalHostIds.includes(input.hostId)) {
    return 'That member is already an additional host.'
  }
  return null
}

export function sameHostIds(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((hostId, index) => hostId === right[index])
  )
}

export function normalizeHostSearchQuery(
  value: string
): { query: string } | { error: string } {
  const query = value.trim().replace(/\s+/g, ' ')
  if (query.length < 2) {
    return { error: 'Enter at least 2 characters to search hosts.' }
  }
  if (query.length > 80) {
    return { error: 'Search is limited to 80 characters.' }
  }
  return { query }
}

export function escapeHostSearchQuery(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export type StoredEventHosts = {
  /** Database value. Null means the primary host was cleared and the creator is shown. */
  rawPrimaryHostId: string | null
  /** Name to display. Falls back to the creator when the primary host was cleared. */
  primaryHostId: string
  additionalHostIds: string[]
}

export type EventHostLoadError = {
  message?: string
  code?: string
  details?: string
  hint?: string
} | null

export type EventHostMap = {
  schemaReady: boolean
  loadError: string | null
  byEventId: Record<string, StoredEventHosts>
}

function creatorFallbackMap(
  events: readonly { id: string; owner_id: string }[]
): Record<string, StoredEventHosts> {
  return Object.fromEntries(
    events.map((event) => [
      event.id,
      {
        rawPrimaryHostId: null,
        primaryHostId: event.owner_id,
        additionalHostIds: [],
      },
    ])
  )
}

export const EVENT_HOST_ROWS_MISSING_MESSAGE =
  'Could not load the primary host for every event.'

/**
 * Missing host columns are the pre-migration state: show the creator.
 * A loaded row with a null primary host is that cleared value.
 * A requested event with no row is a load error, not a cleared primary host.
 * Any other read failure stays an error and does not invent an empty host list.
 */
export function interpretEventHostLoad(input: {
  events: readonly { id: string; owner_id: string }[]
  primaryError: EventHostLoadError
  primaryRows: readonly { id: string; primary_host_id: string | null }[] | null
  additionalError: EventHostLoadError
  additionalRows:
    | readonly { event_id: string; profile_id: string; sort_order: number }[]
    | null
}): EventHostMap {
  if (input.primaryError || !input.primaryRows) {
    if (isMissingEventHostSchemaError(input.primaryError)) {
      return {
        schemaReady: false,
        loadError: null,
        byEventId: creatorFallbackMap(input.events),
      }
    }
    return {
      schemaReady: false,
      loadError: input.primaryError?.message ?? 'Could not load event hosts.',
      byEventId: {},
    }
  }

  if (input.additionalError || !input.additionalRows) {
    if (isMissingEventHostSchemaError(input.additionalError)) {
      return {
        schemaReady: false,
        loadError: null,
        byEventId: creatorFallbackMap(input.events),
      }
    }
    return {
      schemaReady: false,
      loadError:
        input.additionalError?.message ?? 'Could not load additional hosts.',
      byEventId: {},
    }
  }

  const primaryByEvent = new Map(
    input.primaryRows.map((row) => [row.id, row])
  )
  if (input.events.some((event) => !primaryByEvent.has(event.id))) {
    return {
      schemaReady: false,
      loadError: EVENT_HOST_ROWS_MISSING_MESSAGE,
      byEventId: {},
    }
  }

  const additionalByEvent = new Map<string, string[]>()
  const ordered = [...input.additionalRows].sort(
    (left, right) => left.sort_order - right.sort_order
  )
  for (const row of ordered) {
    const hosts = additionalByEvent.get(row.event_id) ?? []
    hosts.push(row.profile_id)
    additionalByEvent.set(row.event_id, hosts)
  }

  const byEventId: Record<string, StoredEventHosts> = {}
  for (const event of input.events) {
    const row = primaryByEvent.get(event.id)
    const rawPrimaryHostId = row?.primary_host_id ?? null
    byEventId[event.id] = {
      rawPrimaryHostId,
      primaryHostId: eventDisplayHostId({
        owner_id: event.owner_id,
        primary_host_id: rawPrimaryHostId,
      }),
      additionalHostIds: additionalByEvent.get(event.id) ?? [],
    }
  }

  return { schemaReady: true, loadError: null, byEventId }
}

export function decideHostAssignment(input: {
  actorRole: string | null | undefined
  currentPrimaryHostId: string
  currentAdditionalHostIds?: readonly string[]
  nextPrimaryHostId: string
  nextAdditionalHostIds: readonly string[]
  candidates: readonly HostCandidate[]
}): HostAssignmentDecision {
  if (input.actorRole !== 'admin') {
    return { ok: false, error: 'You do not have permission to assign event hosts.' }
  }

  const primaryHostId = input.nextPrimaryHostId.trim()
  if (!isEventHostId(primaryHostId)) {
    return { ok: false, error: 'Choose a hosting-enabled member as the primary host.' }
  }

  const additionalHostIds: string[] = []
  const seenAdditional = new Set<string>()
  for (const value of input.nextAdditionalHostIds) {
    const hostId = value.trim()
    if (!isEventHostId(hostId)) {
      return { ok: false, error: 'Choose hosting-enabled members as additional hosts.' }
    }
    if (hostId === primaryHostId) {
      return {
        ok: false,
        error: 'The primary host cannot also be an additional host.',
      }
    }
    if (seenAdditional.has(hostId)) {
      return { ok: false, error: 'Remove duplicate additional hosts before saving.' }
    }
    seenAdditional.add(hostId)
    additionalHostIds.push(hostId)
  }

  if (additionalHostIds.length > MAX_ADDITIONAL_HOSTS) {
    return {
      ok: false,
      error: `An event can have up to ${MAX_ADDITIONAL_HOSTS} additional hosts.`,
    }
  }

  const candidatesById = new Map(
    input.candidates.map((candidate) => [candidate.id, candidate])
  )
  const retainedAdditional = new Set(input.currentAdditionalHostIds ?? [])
  const primaryChanged = primaryHostId !== input.currentPrimaryHostId
  if (primaryChanged) {
    const candidate = candidatesById.get(primaryHostId)
    if (!isHostingEnabledMember(candidate)) {
      return {
        ok: false,
        error: 'The primary host must be a member with hosting abilities.',
      }
    }
  }

  for (const hostId of additionalHostIds) {
    if (retainedAdditional.has(hostId)) continue
    const candidate = candidatesById.get(hostId)
    if (!isHostingEnabledMember(candidate)) {
      return {
        ok: false,
        error: 'Additional hosts must be members with hosting abilities.',
      }
    }
  }

  return { ok: true, primaryHostId, additionalHostIds }
}

export function isMissingEventHostSchemaError(
  error:
    | {
        message?: string
        code?: string
        details?: string
        hint?: string
      }
    | null
    | undefined
): boolean {
  if (!error) return false
  const haystack = [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const mentionsHost =
    haystack.includes('primary_host_id') ||
    haystack.includes('event_additional_hosts') ||
    haystack.includes('assign_event_hosts') ||
    haystack.includes('create_event_with_hosts') ||
    haystack.includes('update_event_with_hosts')
  const missing =
    haystack.includes('does not exist') ||
    haystack.includes('schema cache') ||
    haystack.includes('could not find') ||
    haystack.includes('42p01') ||
    haystack.includes('pgrst204') ||
    haystack.includes('pgrst205')
  return mentionsHost && missing
}

export const EVENT_HOST_SCHEMA_REQUIRED_MESSAGE =
  'Host assignment cannot be saved until the event host migration is applied.'
