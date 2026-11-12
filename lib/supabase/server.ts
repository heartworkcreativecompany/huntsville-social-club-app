import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { REMOVED_ACCOUNT_MESSAGE } from '@/lib/member-removal'
import { isMissingSchemaColumnError } from '@/lib/profile-query-fields'

type AppSupabaseClient = ReturnType<typeof createServerClient<Database>>

export async function createClient(options?: { allowRemovedAccount?: boolean }) {
  const cookieStore = await cookies()

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  if (options?.allowRemovedAccount) return client
  if (await callerAccountIsRemoved(client)) {
    return blockRemovedAccountClient(client)
  }
  return client
}

async function callerAccountIsRemoved(client: AppSupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return false

  const { data, error } = await client
    .from('profiles')
    .select('removed_at')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    if (error.code === '42703' || isMissingSchemaColumnError(error)) return false
    return false
  }

  return data?.removed_at != null
}

function blockRemovedAccountClient(client: AppSupabaseClient): AppSupabaseClient {
  const result = {
    data: null,
    error: { message: REMOVED_ACCOUNT_MESSAGE, code: 'account_removed' },
    count: null,
    status: 403,
    statusText: 'Forbidden',
  }
  const promise = Promise.resolve(result)
  const handler: ProxyHandler<CallableFunction> = {
    get(_target, prop) {
      if (prop === 'then') return promise.then.bind(promise)
      if (prop === 'catch') return promise.catch.bind(promise)
      if (prop === 'finally') return promise.finally.bind(promise)
      return () => chain
    },
    apply() {
      return chain
    },
  }
  const chain = new Proxy(function inactiveQuery() {}, handler)

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'auth' || prop === 'realtime' || prop === 'storage') {
        return Reflect.get(target, prop, receiver)
      }
      if (prop === 'from' || prop === 'rpc' || prop === 'schema') {
        return () => chain
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}
