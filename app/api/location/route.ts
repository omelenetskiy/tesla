import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { reverseGeocode } from '@/lib/geo/place'

export const dynamic = 'force-dynamic'

/**
 * GET /api/location?lat=..&lon=.. — coordinates in, a place label out.
 *
 * Server-side rather than a browser fetch for two reasons: the gazetteer needs a
 * identifying User-Agent and a cache shared by every open of the dashboard, and a
 * client-side call would put a third-party host on the render path of a screen that is
 * meant to be readable in a car.
 *
 * A `200` with `place: null` is the normal answer for anything it cannot resolve. The
 * caller then shows raw coordinates. It is never a 5xx, because a gazetteer being down
 * is not a fault the driver can act on.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })

  const url = new URL(request.url)
  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '')
  const lon = Number.parseFloat(url.searchParams.get('lon') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ place: null, reason: 'invalid_coordinates' })
  }

  const place = await reverseGeocode(lat, lon)
  return NextResponse.json({ place })
}
