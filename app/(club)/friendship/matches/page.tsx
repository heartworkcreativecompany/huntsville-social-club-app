import { headers } from 'next/headers'
import { permanentRedirect } from 'next/navigation'
import {
  incomingSearchString,
  LEGACY_INBOX_REDIRECT_STATUS,
  withIncomingQuery,
} from '@/lib/legacy-inbox-redirect'

export default async function FriendshipMatchesLegacyRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (LEGACY_INBOX_REDIRECT_STATUS !== 308) {
    throw new Error('Legacy inbox redirects must use HTTP 308')
  }

  const headerStore = await headers()
  const search = incomingSearchString(await searchParams, (name) =>
    headerStore.get(name)
  )
  permanentRedirect(withIncomingQuery('/matches/friends', search))
}
