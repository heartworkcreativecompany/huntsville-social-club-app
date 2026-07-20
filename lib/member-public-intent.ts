import type { BadgeVariant } from '@/components/ui/badge'
import type { DiscoveryIntent } from '@/lib/membership-systems'
import { DATING_CONNECTION_OPTION } from '@/lib/compatibility/types'

/** Member-facing connection categories — aligned with directory intent filters. */
export const MEMBER_PUBLIC_INTENT_OPTIONS = [
  { value: 'networking', label: 'Networking' },
  { value: 'dating', label: 'Dating' },
  { value: 'friends', label: 'Friends' },
] as const

export type MemberPublicIntentValue =
  (typeof MEMBER_PUBLIC_INTENT_OPTIONS)[number]['value']

export const MEMBER_PUBLIC_INTENT_LABELS = MEMBER_PUBLIC_INTENT_OPTIONS.map(
  (option) => option.label
)

export const CONNECTION_LOOKING_FOR_FIELD = {
  label: 'What kinds of connections are you looking for?',
  helper: 'Select all that apply.',
} as const

export const CONNECTION_TYPES_OPEN_TO_FIELD = {
  label: 'Connection types open to',
  helper:
    'Optional. Shown on your profile as extra detail — not used for directory filters.',
} as const

const LABEL_BY_VALUE = Object.fromEntries(
  MEMBER_PUBLIC_INTENT_OPTIONS.map((option) => [option.value, option.label])
) as Record<MemberPublicIntentValue, string>

const VALUE_BY_LABEL = Object.fromEntries(
  MEMBER_PUBLIC_INTENT_OPTIONS.map((option) => [option.label, option.value])
) as Record<string, MemberPublicIntentValue>

const CANONICAL_INTENT_LABELS = new Set<string>([
  ...MEMBER_PUBLIC_INTENT_LABELS,
  'New friends',
  'Professional peers',
])

export function memberPublicIntentLabel(
  value: MemberPublicIntentValue
): string {
  return LABEL_BY_VALUE[value]
}

export function memberPublicIntentBadgeVariant(): BadgeVariant {
  return 'category'
}

export function memberPublicIntentValueFromLabel(
  label: string
): MemberPublicIntentValue | null {
  return VALUE_BY_LABEL[label] ?? null
}

export function memberPublicIntentLabelsFromValues(
  values: MemberPublicIntentValue[]
): string[] {
  return values.map((value) => memberPublicIntentLabel(value))
}

export function memberPublicIntentValuesFromLabels(
  labels: string[]
): MemberPublicIntentValue[] {
  return labels
    .map((label) => memberPublicIntentValueFromLabel(label))
    .filter((value): value is MemberPublicIntentValue => value != null)
}

export function parseConnectionIntents(
  value: unknown
): MemberPublicIntentValue[] {
  if (!Array.isArray(value)) return []
  const values = new Set<MemberPublicIntentValue>()
  for (const entry of value) {
    if (entry === 'networking' || entry === 'dating' || entry === 'friends') {
      values.add(entry)
    }
  }
  return MEMBER_PUBLIC_INTENT_OPTIONS.map((option) => option.value).filter(
    (intent) => values.has(intent)
  )
}

/** Canonical intents stored in profiles.connection_intents. */
export function memberPublicIntentsFromConnectionIntents(
  connectionIntents: string[] | null | undefined
): MemberPublicIntentValue[] {
  return parseConnectionIntents(connectionIntents)
}

/** Legacy parse — only for backfill / old connections_open_to rows. */
export function memberPublicIntentsFromConnectionsOpenTo(
  connectionsOpenTo: string[] | null | undefined
): MemberPublicIntentValue[] {
  const values = new Set<MemberPublicIntentValue>()

  for (const entry of connectionsOpenTo ?? []) {
    const trimmed = entry.trim()
    if (!trimmed) continue

    const fromLabel = memberPublicIntentValueFromLabel(trimmed)
    if (fromLabel) {
      values.add(fromLabel)
      continue
    }

    const lower = trimmed.toLowerCase()
    if (lower === 'dating' || lower === 'networking' || lower === 'friends') {
      values.add(lower as MemberPublicIntentValue)
      continue
    }
    if (lower === 'new friends') {
      values.add('friends')
      continue
    }
    if (lower === 'professional peers') {
      values.add('networking')
    }
  }

  return MEMBER_PUBLIC_INTENT_OPTIONS.map((option) => option.value).filter(
    (value) => values.has(value)
  )
}

export function resolveMemberPublicIntents(profile: {
  connection_intents?: string[] | null
  connections_open_to?: string[] | null
  discovery_intent?: string | null
}): MemberPublicIntentValue[] {
  const fromColumn = memberPublicIntentsFromConnectionIntents(
    profile.connection_intents
  )
  if (fromColumn.length > 0) return fromColumn

  const fromLegacyOpenTo = memberPublicIntentsFromConnectionsOpenTo(
    profile.connections_open_to
  )
  if (fromLegacyOpenTo.length > 0) return fromLegacyOpenTo

  const intent = profile.discovery_intent
  if (
    intent === 'networking' ||
    intent === 'dating' ||
    intent === 'friends'
  ) {
    return [intent]
  }

  return []
}

export function discoveryIntentFromMemberIntents(
  intents: MemberPublicIntentValue[]
): DiscoveryIntent | null {
  if (intents.length === 0) return null
  if (intents.length === 1) return intents[0]
  return 'mixed'
}

export function memberMatchesPublicIntentFilter(
  publicIntents: MemberPublicIntentValue[],
  filter: Exclude<DiscoveryIntent, '' | 'mixed'>
): boolean {
  return publicIntents.includes(filter)
}

export function memberMatchesMixedIntentFilter(
  publicIntents: MemberPublicIntentValue[],
  discoveryIntent: string | null | undefined
): boolean {
  if (publicIntents.length >= 2) return true
  return (discoveryIntent ?? '') === 'mixed'
}

export function includesDatingIntent(
  connectionIntents: string[] | null | undefined
): boolean {
  return memberPublicIntentsFromConnectionIntents(connectionIntents).includes(
    'dating'
  )
}

/** @deprecated Use includesDatingIntent(connection_intents) */
export function datingPresentInConnectionsOpenTo(
  connectionsOpenTo: string[] | null | undefined
): boolean {
  if ((connectionsOpenTo ?? []).includes(DATING_CONNECTION_OPTION)) return true
  return memberPublicIntentsFromConnectionsOpenTo(connectionsOpenTo).includes(
    'dating'
  )
}

export function sanitizeConnectionsOpenToForStorage(
  connectionsOpenTo: string[],
  connectionIntents: MemberPublicIntentValue[]
): string[] {
  const intentLabels = new Set(
    memberPublicIntentLabelsFromValues(connectionIntents)
  )
  return connectionsOpenTo
    .map((entry) => entry.trim())
    .filter(
      (entry) =>
        entry.length > 0 &&
        !intentLabels.has(entry) &&
        !CANONICAL_INTENT_LABELS.has(entry)
    )
}
