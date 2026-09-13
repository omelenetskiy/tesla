import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const path = request.nextUrl.pathname
  const publicPaths = ['/api/fleet/callback', '/.well-known/appspecific/com.tesla.3p.public-key.pem']

  const isPublic =
    publicPaths.includes(path) ||
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/_next') ||
    path.startsWith('/maplibre/') ||
    path.startsWith('/icons/') ||
    path === '/manifest.webmanifest'

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const fleetAuthorized = request.cookies.get('fleet_authorized')?.value === '1'
  const isApi = path.startsWith('/api/')
  const canConnectFleet =
    path === '/tesla-login' ||
    path === '/settings' ||
    path.startsWith('/api/settings') ||
    path.startsWith('/api/fleet/')

  if (user && !isPublic && !isApi && !canConnectFleet && !fleetAuthorized) {
    return NextResponse.redirect(new URL('/tesla-login?fleet=required', request.url))
  }

  if (user && path === '/login') {
    return NextResponse.redirect(new URL(fleetAuthorized ? '/' : '/tesla-login?fleet=required', request.url))
  }

  if (user && path === '/tesla-login' && fleetAuthorized) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
