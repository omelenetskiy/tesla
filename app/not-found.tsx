'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CalendarDays, Home, Route } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  const router = useRouter()

  const goBackSafely = () => {
    if (typeof window === 'undefined') {
      router.push('/')
      return
    }

    const referrer = document.referrer
    const sameOriginReferrer = referrer ? new URL(referrer).origin === window.location.origin : false

    if (sameOriginReferrer && window.history.length > 1) {
      router.back()
      return
    }

    router.push('/')
  }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 text-ink sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-[980px] items-center justify-center">
        <section className="w-full overflow-hidden rounded-[32px] border border-line bg-surface p-6 shadow-sm sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="rounded-[28px] border border-dashed border-line bg-canvas p-6">
              <Badge variant="outline" className="mb-4">404 · route not found</Badge>
              <div className="flex size-14 items-center justify-center rounded-2xl border border-danger-line bg-danger-soft text-danger">
                <AlertTriangle className="size-6" aria-hidden />
              </div>
              <h1 className="mt-5 text-[32px] font-semibold tracking-[-0.03em] text-ink sm:text-[40px]">
                This route is outside the current telemetry map.
              </h1>
              <p className="mt-3 max-w-[34ch] text-[14px] leading-6 text-ink-secondary sm:text-[15px]">
                The destination may have moved during the migration plan, or the link may point to an older product surface.
                Use one of the verified paths below to get back to live screens.
              </p>
            </div>

            <div>
              <div className="rounded-[24px] border border-line bg-surface-muted p-5">
                <div className="text-[14px] font-semibold text-ink">Recovery paths</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={goBackSafely} variant="default">
                    <ArrowLeft />
                    Go back safely
                  </Button>
                  <Button asChild>
                    <Link href="/">
                      <Home />
                      Dashboard
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/calendar">
                      <CalendarDays />
                      Calendar
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Link href="/calendar" className="rounded-[24px] border border-line bg-surface px-4 py-4 transition-colors hover:bg-surface-muted">
                  <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
                    <CalendarDays className="size-4 text-ink-tertiary" aria-hidden />
                    Daily activity hub
                  </div>
                  <p className="mt-2 text-[12.5px] leading-5 text-ink-secondary">
                    The new landing surface for day-by-day telemetry rollups and migration-safe navigation.
                  </p>
                </Link>

                <Link href="/trips" className="rounded-[24px] border border-line bg-surface px-4 py-4 transition-colors hover:bg-surface-muted">
                  <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
                    <Route className="size-4 text-ink-tertiary" aria-hidden />
                    Trips
                  </div>
                  <p className="mt-2 text-[12.5px] leading-5 text-ink-secondary">
                    Jump directly to verified trip history while the missing route is corrected.
                  </p>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

