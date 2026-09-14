import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAuthEnv, SUPABASE_AUTH_ENV_ERROR } from '@/lib/supabase-auth-env'

function toAppUrl(path: string, request: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return new URL(path, request.url)
  }
  const canonical = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (canonical) {
    try {
      return new URL(path, canonical)
    } catch {
      // Fall back to the incoming host when NEXT_PUBLIC_APP_URL is malformed.
    }
  }
  return new URL(path, request.url)
}

function isPublicPath(path: string): boolean {
  const publicPaths = ['/api/fleet/callback', '/.well-known/appspecific/com.tesla.3p.public-key.pem']
  return (
    publicPaths.includes(path) ||
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/_next') ||
    path.startsWith('/maplibre/') ||
    path.startsWith('/icons/') ||
    path === '/manifest.webmanifest'
  )
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const path = request.nextUrl.pathname
  const isPublic = isPublicPath(path)
  const isApi = path.startsWith('/api/')
  const supabaseEnv = getSupabaseAuthEnv()

  if (!supabaseEnv) {
    if (isPublic) return response
    if (isApi) {
      return NextResponse.json({ message: SUPABASE_AUTH_ENV_ERROR }, { status: 503 })
    }
    return NextResponse.redirect(toAppUrl('/login?supabase=not-configured', request))
  }

  const supabase = createServerClient(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublic) {
    if (isApi) return NextResponse.json({ message: 'Sign-in required' }, { status: 401 })
    return NextResponse.redirect(toAppUrl('/login', request))
  }

  const fleetAuthorized = request.cookies.get('fleet_authorized')?.value === '1'
  const canConnectFleet =
    path === '/tesla-login' ||
    path === '/settings' ||
    path.startsWith('/api/settings') ||
    path.startsWith('/api/fleet/')

  if (user && !isPublic && !isApi && !canConnectFleet && !fleetAuthorized) {
    return NextResponse.redirect(toAppUrl('/tesla-login?fleet=required', request))
  }

  if (user && path === '/login') {
    return NextResponse.redirect(toAppUrl(fleetAuthorized ? '/' : '/tesla-login?fleet=required', request))
  }

  if (user && path === '/tesla-login' && fleetAuthorized) {
    return NextResponse.redirect(toAppUrl('/', request))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
