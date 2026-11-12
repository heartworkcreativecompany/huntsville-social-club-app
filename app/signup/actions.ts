'use server'

import { signUpAccount, type SignUpAccountInput } from '@/lib/signup-account'
import { removedApplicationBlock } from '@/lib/member-removal-db'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAnonymousClient } from '@/lib/supabase/anonymous'

export async function signUpAccountAction(input: SignUpAccountInput) {
  return signUpAccount(input, {
    removedBlock: (email) => removedApplicationBlock(createAdminClient(), email),
    signUp: async (args) => {
      const supabase = createAnonymousClient()
      const { error } = await supabase.auth.signUp(args)
      return { error: error ? { message: error.message } : null }
    },
  })
}
