import 'server-only'

import { revalidatePath } from 'next/cache'

export function revalidateFriendshipRoutes(): void {
  revalidatePath('/profile')
  revalidatePath('/friendship')
  revalidatePath('/friendship/matches')
}
