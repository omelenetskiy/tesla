import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAuthEnv, hasSupabaseAuthEnv, SUPABASE_AUTH_ENV_ERROR } from '@/lib/supabase-auth-env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const env = getSupabaseAuthEnv()
  if (!env) throw new Error(SUPABASE_AUTH_ENV_ERROR)

  return createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Components cannot mutate cookies; proxy refreshes sessions.
          }
        },
      },
    },
  )
}

export async function getAuthenticatedUser() {
  if (!hasSupabaseAuthEnv()) return null
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}
