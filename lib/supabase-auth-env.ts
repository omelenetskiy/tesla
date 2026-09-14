export const SUPABASE_AUTH_ENV_ERROR = 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the environment.'

export type SupabaseAuthEnv = {
  url: string
  anonKey: string
}

export function getSupabaseAuthEnv(): SupabaseAuthEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function hasSupabaseAuthEnv(): boolean {
  return getSupabaseAuthEnv() !== null
}
