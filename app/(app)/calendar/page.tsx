import Link from 'next/link'
import { ArrowRight, CalendarDays, Route, Siren, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const nextMilestones = [
  'Day-by-day trip, charging, and alert indicators',
  'Daily activity reports with route and session drill-downs',
  'Timezone-aware navigation for historic telemetry windows',
]

const sources = [
  {
    href: '/trips',
    label: 'Trips',
    description: 'Recorded drives, route health, and efficiency details already available today.',
    icon: Route,
  },
  {
    href: '/charging',
    label: 'Charging',
    description: 'Session timelines and charge curves will feed the calendar summaries next.',
    icon: Zap,
  },
  {
    href: '/alerts',
    label: 'Alerts',
    description: 'Vehicle-reported warnings and app-derived conditions will appear as day markers.',
    icon: Siren,
  },
] as const

export default function CalendarPage() {
  return (
    <div className="mx-auto w-full max-w-[1040px] space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-line bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[640px]">
            <Badge variant="accent" className="mb-3">Phase 4 bootstrap</Badge>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink sm:text-[34px]">
              Calendar is now part of the product surface.
            </h1>
            <p className="mt-2 max-w-[58ch] text-[14px] leading-6 text-ink-secondary sm:text-[15px]">
              This route replaces the old Analytics entry point and becomes the landing surface for daily telemetry rollups.
              The next slice is wiring real trip, charging, and alert aggregates into a timezone-aware day view without fabricating values.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/trips">
                Open trips
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/charging">Open charging</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <CalendarDays className="size-4 text-ink-tertiary" aria-hidden />
            What lands here next
          </div>
          <ul className="mt-4 space-y-3 text-[14px] leading-6 text-ink-secondary">
            {nextMilestones.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-canvas px-4 py-3 text-[12.5px] leading-5 text-ink-tertiary">
            Guardrail: until server-side day aggregation is connected, this page only routes to verified source screens. No placeholder metrics,
            no synthetic totals.
          </p>
        </div>

        <div className="rounded-[24px] border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="text-[14px] font-semibold text-ink">Source screens already live</div>
          <div className="mt-4 space-y-3">
            {sources.map(({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-start gap-3 rounded-2xl border border-line px-4 py-3 transition-colors hover:bg-surface-muted"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-canvas text-ink-secondary transition-colors group-hover:text-ink">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
                    {label}
                    <ArrowRight className="size-3.5 text-ink-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-5 text-ink-secondary">{description}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

