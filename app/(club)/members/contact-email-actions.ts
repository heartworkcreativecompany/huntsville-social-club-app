'use server'

import { revalidatePath } from 'next/cache'
import {
  normalizeContactEmailInput,
  validateContactEmailInput,
} from '@/lib/member-contact-email'
import { MEMBER_PROFILES_VIEW } from '@/lib/member-profiles-view'
import { createClient } from '@/lib/supabase/server'

export async function updateMemberContactEmail(input: {
  contactEmail: string
  showContactEmail: boolean
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: profile } = await supabase
    .from(MEMBER_PROFILES_VIEW)
    .select('application_status')
    .eq('id', user.id)
    .single()

  if (profile?.application_status !== 'approved') {
    return {
      error:
        'Contact email settings are available after your membership application is approved.',
    }
  }

  const validationError = validateContactEmailInput(input.contactEmail)
  if (validationError) {
    return { error: validationError }
  }

  const contactEmail = normalizeContactEmailInput(input.contactEmail)
  const showContactEmail = input.showContactEmail && Boolean(contactEmail)

  const { error } = await supabase
    .from('profiles')
    .update({
      contact_email: contactEmail,
      show_contact_email: showContactEmail,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/members')
  revalidatePath('/profile')
  revalidatePath(`/members/${user.id}`)
  revalidatePath('/home')

  return { success: true as const }
}
