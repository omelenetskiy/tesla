export { default } from '../dashboard/page'

/* legacy content intentionally disabled

AppShell } from '@/components/app-shell'
// Lazy load heavy components
import dynamic from 'next/dynamic'
// Lazy load heavy components
  import('@/components/dashboard-widgets').then((mod) => ({ default: mod.BatteryWidget }))
const BatteryWidget = lazy(() => import('@/components/dashboard-widgets').then((mod) => ({ default: mod.BatteryWidget })))
const LastTripWidget = lazy(() => import('@/components/dashboard-widgets').then((mod) => ({ default: mod.LastTripWidget })))
const ChargingWidget = lazy(() => import('@/components/dashboard-widgets').then((mod) => ({ default: mod.ChargingWidget })))
const EfficiencyWidget = lazy(() => import('@/components/dashboard-widgets').then((mod) => ({ default: mod.EfficiencyWidget })))
const LineChart = lazy(() => import('@/components/ui/charts').then((mod) => ({ default: mod.LineChart })))
const MetricsSummary = lazy(() => import('@/components/ui/charts').then((mod) => ({ default: mod.MetricsSummary })))
const TripsTable = lazy(() => import('@/components/ui/table').then((mod) => ({ default: mod.TripsTable })))
    <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
  )
  return <div className="h-40 rounded-lg bg-gray-100 animate-pulse dark:bg-gray-800" />

  const [loading, setLoading] = React.useState(true)
export default function DashboardOptimizedPage() {
        const response = await fetch('/api/vehicle/status', {
        // Use service worker cache if available
          },
        setLoading(true)
    let cancelled = false
        // Use service worker cache if available
          },
          },
          headers: { 'Cache-Control': 'max-age=60' },
        setData(data)
        if (!response.ok) throw new Error('Failed to fetch vehicle status')
        const json = await response.json()
        if (!cancelled) setData(json)
        setLoading(false)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error')
    loadData()

    return () => clearInterval(interval)
    void loadData()
      <AppShell>
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    return (
      <AppShell>
  if (error) return <div className="text-red-600 dark:text-red-400">{error}</div>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <Button size="sm">↻ Refresh</Button>
      </div>
          <Suspense fallback={<WidgetSkeleton />}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<WidgetSkeleton />}>
          <BatteryWidget level={data?.batteryPercent || 75} range={data?.range || 300} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <LastTripWidget distance={45.2} efficiency={220} date={'2026-09-15T12:00:00.000Z'} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <ChargingWidget
            lastCharge={'2026-09-15T08:00:00.000Z'}
            nextCharge={'2026-09-16T12:00:00.000Z'}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <EfficiencyWidget current={220} average={225} />
        </Suspense>
      </div>
          <LineChart
      <Suspense fallback={<WidgetSkeleton />}>
        <LineChart
          data={[
            { timestamp: '2026-09-15T11:00:00.000Z', value: 65 },
            { timestamp: '2026-09-15T12:00:00.000Z', value: data?.batteryPercent || 75 },
          ]}
          title="Battery Level"
          unit="%"
          height="h-80"
        />
      </Suspense>
            metrics={[
      <Suspense fallback={<WidgetSkeleton />}>
        <MetricsSummary
          metrics={[
            { label: 'Health', value: 'Excellent', trend: 'stable' },
            { label: 'Cycles', value: '234', trend: 'up' },
            { label: 'Degradation', value: '3.2%', trend: 'down' },
          ]}
        />
      </Suspense>
        </Suspense>
      <Suspense fallback={<WidgetSkeleton />}>
        <TripsTable trips={[]} isLoading={false} />
      </Suspense>
    </div>
  )
}
*/
