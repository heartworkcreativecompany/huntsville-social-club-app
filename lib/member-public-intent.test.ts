import { describe, expect, it } from 'vitest'
import {
  memberPublicIntentBadgeVariant,
  memberPublicIntentLabel,
  memberPublicIntentsFromConnectionsOpenTo,
  parseConnectionIntents,
  resolveMemberPublicIntents,
  sanitizeConnectionsOpenToForStorage,
} from '@/lib/member-public-intent'

describe('memberPublicIntentBadgeVariant', () => {
  it('uses the secondary category badge style for connection intents', () => {
    expect(memberPublicIntentBadgeVariant()).toBe('category')
  })
})

describe('memberPublicIntentsFromConnectionsOpenTo', () => {
  it('returns each selected intent without collapsing to mixed', () => {
    const intents = memberPublicIntentsFromConnectionsOpenTo([
      'Networking',
      'Dating',
    ])

    expect(intents).toEqual(['networking', 'dating'])
    expect(intents.map(memberPublicIntentLabel)).toEqual(['Networking', 'Dating'])
  })
})

describe('resolveMemberPublicIntents', () => {
  it('prefers connection_intents over legacy fields', () => {
    expect(
      resolveMemberPublicIntents({
        connection_intents: ['friends'],
        connections_open_to: ['Dating', 'Activity partners'],
        discovery_intent: 'networking',
      })
    ).toEqual(['friends'])
  })

  it('falls back to legacy connections_open_to when connection_intents is empty', () => {
    expect(
      resolveMemberPublicIntents({
        connection_intents: [],
        connections_open_to: ['Networking', 'Dating'],
      })
    ).toEqual(['networking', 'dating'])
  })
})

describe('sanitizeConnectionsOpenToForStorage', () => {
  it('removes canonical intent labels from connection types', () => {
    expect(
      sanitizeConnectionsOpenToForStorage(
        ['Networking', 'Activity partners', 'Dating'],
        ['networking', 'dating']
      )
    ).toEqual(['Activity partners'])
  })
})

describe('parseConnectionIntents', () => {
  it('deduplicates valid intent values', () => {
    expect(parseConnectionIntents(['dating', 'dating', 'friends'])).toEqual([
      'dating',
      'friends',
    ])
  })
})
