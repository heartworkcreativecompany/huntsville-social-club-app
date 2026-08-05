'use server'

import { createClient } from '@/lib/supabase/server'
import {
  findOrCreateSponsor,
  type SponsorOption,
} from '@/lib/event-sponsors'
import { getViewer } from '@/lib/viewer'

export async function createSponsorForAdmin(input: {
  businessName: string
}): Promise<{ sponsor: SponsorOption } | { error: string }> {
  const viewer = await getViewer()
  if (!viewer || viewer.role !== 'admin') {
    return { error: 'Admin access required.' }
  }

  const supabase = await createClient()
  return findOrCreateSponsor(supabase, {
    businessName: input.businessName,
  })
}
