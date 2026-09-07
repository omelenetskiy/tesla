import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/**
 * Server-only Supabase client using the service role key.
 * Never import this file from a Client Component.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}

export function isSupabaseConfigured(): boolean {
  return Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
