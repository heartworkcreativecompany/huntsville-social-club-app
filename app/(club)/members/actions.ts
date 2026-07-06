'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  mergeProfileIntoDraft,
  profileColumnsFromDraft,
} from '@/lib/application-draft-sync'
import { parseApplicationDraft } from '@/lib/application'
import { runCompatibilityConnectionsLifecycle } from '@/lib/compatibility/sync-server'

export async function updateMemberProfile(input: {
  displayName: string
  bio: string
  locationArea: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('application_draft, application_status, connections_open_to')
    .eq('id', user.id)
    .single()

  const previousConnections = profile?.connections_open_to ?? []
  const draft = profile?.application_draft
    ? parseApplicationDraft(profile.application_draft)
    : mergeProfileIntoDraft(null)

  draft.profile.displayName = input.displayName.trim()
  draft.prompts.hopingToMeet = input.bio.trim()
  draft.location.neighborhoodOrArea = input.locationArea.trim()

  const columns = profileColumnsFromDraft(draft)

  const { error } = await supabase
    .from('profiles')
    .update({
      ...columns,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  await runCompatibilityConnectionsLifecycle(
    user.id,
    previousConnections,
    columns.connections_open_to
  )

  revalidatePath('/members')
  revalidatePath('/profile')
  revalidatePath(`/members/${user.id}`)
  revalidatePath('/home')

  return { success: true as const }
}
