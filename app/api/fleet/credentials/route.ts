import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * Disconnect. Deletes only this app's own tokens.
 *
 * It deliberately does not attempt to revoke the grant on Tesla's side: the revoke endpoint
 * is not in the pinned contract (plan §4b), and guessing at an auth-side call is how a
 * working credential gets burned instead of released. The Settings copy says exactly what
 * happens and where the rest is done.
 */
export async function DELETE() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  const { error } = await getSupabaseAdmin().from('fleet_credentials').delete().eq('owner_id', user.id)
  if (error) return NextResponse.json({ message: `Could not delete the stored tokens: ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}
