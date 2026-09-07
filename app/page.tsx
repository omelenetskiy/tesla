'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Battery, BatteryCharging, Car, Clock, Gauge, LogOut, MapPin, Menu, Moon, RefreshCw, Route, Settings2, ShieldCheck, Snowflake, Sun, Thermometer, TrendingDown, Wifi, X, Zap } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import LiveMap from './components/live-map'
import type { Freshness, Vehicle } from './data'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

// ─── Types ───────────────────────────────────────────────────────────────────
type VehicleInfo = { id: string; name: string; model: string }
type Page = 'Обзор' | 'Поездки' | 'Батарея' | 'Зарядки' | 'Настройки'
type BatteryPoint = { at: string; battery: number; range: number; charging: string }
type ChargeSession = { startedAt: string; endedAt: string; batteryStart: number; batteryEnd: number; energyAdded: number | null; peakPower: number | null; durationMinutes: number }
type TripPoint = { at: string; battery: number; speed: number }
type Trip = { startedAt: string; endedAt: string; odometerStart: number; odometerEnd: number; distance: number; route: [number, number][]; batteryStart: number; batteryEnd: number; durationMinutes: number; avgSpeed: number; maxSpeed: number; points: TripPoint[] }
type History = { battery: BatteryPoint[]; charging: ChargeSession[]; trips: Trip[]; stats: { current: number; minimum: number; maximum: number; discharged: number; snapshots: number } | null }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const stateLabels: Record<string, string> = { Driving: 'В движении', Parked: 'Припаркована', Charging: 'Заряжается', Offline: 'Неактивна' }
const navItems: Array<[Page, typeof Gauge]> = [['Обзор', Gauge], ['Поездки', Route], ['Батарея', TrendingDown], ['Зарядки', BatteryCharging], ['Настройки', Settings2]]

function timeLabel(value: string) { return new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short' }).format(new Date(value)) }
function dateTimeLabel(value: string) { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
function minutesLabel(minutes: number) { return minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` }

function dayGroupLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(date, today)) return 'Сегодня'
  if (sameDay(date, yesterday)) return 'Вчера'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long' }).format(date)
}

function groupByDay<T extends { startedAt: string }>(items: T[]) {
  const groups: Array<[string, T[]]> = []
  for (const item of items) {
    const label = dayGroupLabel(item.startedAt)
    const group = groups.find(([existing]) => existing === label)
    if (group) group[1].push(item)
    else groups.push([label, [item]])
  }
  return groups
}

const freshnessMeta: Record<Freshness, { label: string; tone: 'live' | 'stale' | 'offline' }> = {
  LIVE: { label: 'Подключено', tone: 'live' },
  RECENT: { label: 'Обновлено недавно', tone: 'live' },
  STALE: { label: 'Данные устарели', tone: 'stale' },
  OFFLINE: { label: 'Автомобиль offline', tone: 'offline' },
}

function connectionState(vehicle: Vehicle | null, sleeping: boolean, statusCheckFailed: boolean) {
  if (sleeping) return { label: 'Машина спит', tone: 'offline' as const }
  if (statusCheckFailed) return { label: 'Статус недоступен', tone: 'stale' as const }
  if (!vehicle) return { label: 'Нет данных', tone: 'offline' as const }
  return freshnessMeta[vehicle.freshness]
}

// ─── Theme Toggle ────────────────────────────────────────────────────────────
function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = stored || (prefersDark ? 'dark' : 'light')
    // Apply theme to DOM immediately (outside React state) to avoid flash
    document.documentElement.setAttribute('data-theme', initial)
    // Sync React state after paint via requestAnimationFrame
    const raf = requestAnimationFrame(() => setTheme(initial))
    return () => cancelAnimationFrame(raf)
  }, [])
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    setTheme(next)
  }
  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Переключить тему" title="Переключить тему">
      {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  )
}

// ─── Freshness Badge ─────────────────────────────────────────────────────────
function FreshnessBadge({ vehicle, sleeping, statusCheckFailed }: { vehicle: Vehicle | null; sleeping: boolean; statusCheckFailed: boolean }) {
  const meta = connectionState(vehicle, sleeping, statusCheckFailed)
  return <span className={`badge badge-${meta.tone}`}><i />{meta.label}</span>
}

// ─── Metric ──────────────────────────────────────────────────────────────────
function Metric({ label, value, unit, note }: { label: string; value: string | number; unit?: string; note?: string }) {
  return (
    <div className="metric card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}{unit && <span className="metric-unit">{unit}</span>}</span>
      {note && <span className="metric-note">{note}</span>}
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, text }: { icon: typeof Route; title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={32} /></div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

// ─── Skeleton ───────────────────────────────────────────────────────────────
function SkeletonMetrics() {
  return (
    <div className="metrics-row">
      {[0,1,2,3].map(i => <div key={i} className="metric card"><div className="skeleton skeleton-text" /><div className="skeleton skeleton-metric" style={{marginTop:8}} /></div>)}
    </div>
  )
}

function SkeletonChart() { return <div className="card"><div className="skeleton skeleton-chart" /></div> }
function SkeletonMap() { return <div className="skeleton skeleton-map" /> }

// ─── MAIN DASHBOARD COMPONENT ────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [page, setPage] = useState<Page>('Обзор')
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null)
  const [history, setHistory] = useState<History>({ battery: [], charging: [], trips: [], stats: null })
  const [collectedAt, setCollectedAt] = useState<string | null>(null)
  const [sleeping, setSleeping] = useState(false)
  const [statusCheckFailed, setStatusCheckFailed] = useState(false)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmWake, setConfirmWake] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState(0)
  const [loadingInitial, setLoadingInitial] = useState(true)

  async function loadHistory() {
    const response = await fetch('/api/history')
    if (!response.ok) return
    setHistory(await response.json() as History)
  }

  async function loadVehicle(fresh = false) {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(fresh ? '/api/vehicle?fresh=true&allowWake=true' : '/api/vehicle')
      const payload = await response.json() as { message?: string; vehicle?: Vehicle | null; vehicleInfo?: VehicleInfo; source?: string; collection?: string; collectedAt?: string; reason?: string }
      if (response.status === 404) throw new Error(payload.message || 'Подключите Tesla')
      if (!response.ok && !payload.vehicle) throw new Error(payload.message || payload.reason || 'Не удалось получить данные')
      if (payload.vehicleInfo) setVehicleInfo(payload.vehicleInfo)
      if (payload.vehicle) setVehicle(payload.vehicle)
      if (payload.collectedAt) setCollectedAt(payload.collectedAt)
      if (payload.collection === 'failed') setError(payload.message || payload.reason || 'Не удалось получить актуальный статус Tesla')
      setSleeping(payload.reason === 'vehicle_sleeping' || payload.reason === 'vehicle_sleeping_no_cache')
      setStatusCheckFailed(payload.reason === 'status_check_failed' || payload.reason === 'status_check_failed_no_cache')
      await loadHistory()
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось получить данные')
    } finally { setLoading(false); setLoadingInitial(false) }
  }

  useEffect(() => { const timer = window.setTimeout(() => { void loadVehicle() }, 0); return () => window.clearTimeout(timer) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function requestStatus() {
    if (!confirmWake) { setConfirmWake(true); return }
    setConfirmWake(false)
    await loadVehicle(true)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const name = vehicle?.name || vehicleInfo?.name || 'Tesla'
  const model = vehicle?.model || vehicleInfo?.model || 'Автомобиль подключён'
  const selected = history.trips[selectedTrip]

  // ── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* ── TOP BAR ─────────────────────────────────────────────────── */}
      <header className="topbar">
        <button className="topbar-btn" style={{display:'none'}} onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Меню"><Menu size={18} /></button>
        <div className="topbar-brand"><span className="topbar-brand-icon"><Car size={16} /></span>DRIVE / SCOPE</div>
        <div className="topbar-vehicle">
          <span className="topbar-vehicle-dot" />
          <strong>{name}</strong>
          <span>{model}</span>
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-actions">
          <FreshnessBadge vehicle={vehicle} sleeping={sleeping} statusCheckFailed={statusCheckFailed} />
          <button className="topbar-btn" onClick={() => void loadVehicle()} disabled={loading} title="Обновить"><RefreshCw size={16} style={loading ? {animation:'spin 1s linear infinite'} : {}} /></button>
          <ThemeToggle />
          <button className="topbar-btn" onClick={() => void logout()} title="Выйти"><LogOut size={16} /></button>
        </div>
      </header>

      {/* ── BODY ────────────────────────────────────────────────────── */}
      <div className="app-body">
        {/* Sidebar backdrop (mobile) */}
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-label">Навигация</div>
          <nav className="sidebar-nav" aria-label="Основная навигация">
            {navItems.map(([label, Icon]) => (
              <button key={label} className={`sidebar-item ${page === label ? 'active' : ''}`} onClick={() => { setPage(label); setSidebarOpen(false) }}>
                <Icon size={17} />{label}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className={`sidebar-freshness ${sleeping || statusCheckFailed ? 'offline' : vehicle?.freshness === 'STALE' ? 'stale' : ''}`}>
              <span className="sidebar-freshness-dot" />
              {connectionState(vehicle, sleeping, statusCheckFailed).label}
            </div>
            <button className="sidebar-logout" onClick={() => void logout()}><LogOut size={14} />Выйти</button>
          </div>
        </aside>

        {/* Content */}
        <main className="content">
          <div className="content-inner">
            {error && (
              <div className="card" style={{marginBottom:16,borderColor:'var(--red-border)',background:'var(--red-soft)',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
                <X size={17} style={{color:'var(--red)',flexShrink:0}} />
                <span style={{flex:1,fontSize:13,color:'var(--red)'}}>{error}</span>
                {error.toLowerCase().includes('token') || error.toLowerCase().includes('credentials') ? <a href="/connect" style={{fontSize:12,fontWeight:700}}>Переподключить</a> : null}
                <button onClick={() => setError('')} style={{border:0,background:'transparent',color:'var(--red)',cursor:'pointer'}} aria-label="Закрыть"><X size={15} /></button>
              </div>
            )}
            {confirmWake && (
              <div className="card" style={{marginBottom:16,borderColor:'var(--orange-border)',background:'var(--orange-soft)',padding:'14px 16px',display:'flex',alignItems:'center',gap:16}}>
                <div style={{flex:1}}><strong style={{fontSize:13}}>Запрос может разбудить автомобиль</strong><p style={{margin:'4px 0 0',fontSize:12,color:'var(--ink-secondary)'}}>Подтвердите, если нужен актуальный статус.</p></div>
                <button className="btn btn-primary btn-sm" onClick={() => void requestStatus()}>Разбудить</button>
                <button className="btn btn-sm" onClick={() => setConfirmWake(false)}>Отмена</button>
              </div>
            )}

            {/* Page content */}
            {loadingInitial ? (
              <>
                <div className="page-header"><h1>Обзор</h1><p>Загрузка данных…</p></div>
                <SkeletonMap />
                <div style={{height:16}} />
                <SkeletonMetrics />
              </>
            ) : page === 'Настройки' ? (
              <SettingsView name={name} model={model} />
            ) : !vehicle ? (
              <EmptyVehicle name={name} sleeping={sleeping} onRequest={() => void requestStatus()} loading={loading} />
            ) : page === 'Зарядки' ? (
              <ChargingView vehicle={vehicle} sessions={history.charging} />
            ) : page === 'Поездки' ? (
              <TripsView vehicle={vehicle} trips={history.trips} selectedTrip={selected} selectedIndex={selectedTrip} onSelect={setSelectedTrip} />
            ) : page === 'Батарея' ? (
              <BatteryView battery={history.battery} stats={history.stats} />
            ) : (
              <OverviewView vehicle={vehicle} history={history} collectedAt={collectedAt} sleeping={sleeping} statusCheckFailed={statusCheckFailed} onRequest={() => void requestStatus()} loading={loading} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── EMPTY VEHICLE ───────────────────────────────────────────────────────────
function EmptyVehicle({ name, sleeping, onRequest, loading }: { name: string; sleeping: boolean; onRequest: () => void; loading: boolean }) {
  return (
    <>
      <div className="page-header"><h1>{name}</h1><p>{sleeping ? 'Машина спит · сохранённых данных нет' : 'Подключено, но snapshot ещё не получен'}</p></div>
      <EmptyState icon={Gauge} title={sleeping ? 'Машина спит' : 'Телеметрия ещё не собрана'} text={sleeping ? 'Последних сохранённых данных нет. Запросить актуальный статус можно отдельно.' : 'Обычная загрузка проверяет статус без пробуждения и читает только кэш.'} />
      <div style={{display:'flex',justifyContent:'center',marginTop:16}}>
        <button className="btn btn-primary" onClick={onRequest} disabled={loading}>{loading ? 'Запрос…' : 'Запросить статус'}</button>
      </div>
    </>
  )
}

// ── OVERVIEW ────────────────────────────────────────────────────────────────
function OverviewView({ vehicle, history, collectedAt, sleeping, statusCheckFailed, onRequest, loading }: { vehicle: Vehicle; history: History; collectedAt: string | null; sleeping: boolean; statusCheckFailed: boolean; onRequest: () => void; loading: boolean }) {
  const stateBadgeClass = vehicle.state === 'Driving' ? 'badge-driving' : vehicle.state === 'Charging' ? 'badge-charging' : 'badge-parked'
  return (
    <>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>{vehicle.name}</h1>
            <p>{vehicle.model} · {collectedAt ? `Обновлено ${dateTimeLabel(collectedAt)}` : 'Данные ещё не получены'}</p>
          </div>
          <div className="page-header-actions">
            <span className={`badge ${stateBadgeClass}`}><i />{stateLabels[vehicle.state] || vehicle.state}</span>
            <button className="btn" onClick={onRequest} disabled={loading}><RefreshCw size={15} />Статус</button>
          </div>
        </div>
      </div>

      {/* Map — dominant element */}
      <div className="card" style={{marginBottom:16,overflow:'hidden'}}>
        {vehicle.coordinates ? (
          <div style={{position:'relative'}}>
            <LiveMap vehicle={vehicle} onSelectAction={() => undefined} fullHeight />
            <div className="vehicle-card-float">
              <div className="vehicle-card-float-name"><span className={`badge ${stateBadgeClass}`}><i /></span>{vehicle.name}</div>
              <div className="vehicle-card-float-state">{stateLabels[vehicle.state]} · {vehicle.location || 'Координаты не переданы'}</div>
              <div className="vehicle-card-float-metrics">
                <div><span>Батарея</span><strong>{vehicle.battery}%</strong></div>
                <div><span>Запас</span><strong>{vehicle.range}</strong></div>
                <div><span>Скорость</span><strong>{vehicle.speed}</strong></div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{minHeight:300,display:'grid',placeItems:'center',color:'var(--ink-tertiary)',textAlign:'center',padding:32}}>
            <MapPin size={28} style={{marginBottom:8,opacity:0.5}} /><p style={{fontSize:13}}>В последнем snapshot нет координат автомобиля.</p>
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div className="metrics-row" style={{marginBottom:16}}>
        <Metric label="Заряд" value={vehicle.battery} unit="%" />
        <Metric label="Запас хода" value={vehicle.range} unit="миль" />
        <Metric label="Скорость" value={vehicle.speed} unit="миль/ч" />
        <Metric label="Мощность" value={vehicle.chargePower == null ? '—' : vehicle.chargePower} unit={vehicle.chargePower == null ? undefined : 'кВт'} />
      </div>

      {/* Activity + Vehicle status */}
      <div style={{display:'grid',gridTemplateColumns:'1.1fr .9fr',gap:16}}>
        <div className="card">
          <div className="card-header">
            <div className="card-header-title"><span className="card-overline">АКТИВНОСТЬ</span><span className="card-title">Недавние события</span></div>
            <span style={{fontSize:12,color:'var(--ink-tertiary)'}}>{history.trips.length + history.charging.length} событий</span>
          </div>
          <div className="records">
            {history.trips.slice(0, 3).map((trip) => (
              <div className="record" key={`trip-${trip.startedAt}`}>
                <span className="record-icon blue"><Route size={15} /></span>
                <div className="record-body"><strong>Поездка завершена</strong><span>{dateTimeLabel(trip.endedAt)} · {trip.distance.toFixed(1)} миль</span></div>
              </div>
            ))}
            {history.charging.slice(0, 3).map((session) => (
              <div className="record" key={`charge-${session.startedAt}`}>
                <span className="record-icon green"><BatteryCharging size={15} /></span>
                <div className="record-body"><strong>Зарядка</strong><span>{dateTimeLabel(session.startedAt)} · {session.batteryStart}% → {session.batteryEnd}%</span></div>
              </div>
            ))}
            {!history.trips.length && !history.charging.length && (
              <div style={{padding:24,textAlign:'center',color:'var(--ink-tertiary)',fontSize:12}}>Активность появится после накопления snapshots.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-header-title"><span className="card-overline">АВТОМОБИЛЬ</span><span className="card-title">Состояние</span></div>
            <span className="badge badge-live"><i />{vehicle.connectivity}</span>
          </div>
          <div className="records">
            <div className="record"><BatteryCharging size={16} style={{color:'var(--blue)'}} /><div className="record-body"><strong>Зарядка</strong></div><span className="record-value">{vehicle.chargingState}</span></div>
            <div className="record"><Thermometer size={16} style={{color:'var(--blue)'}} /><div className="record-body"><strong>Салон</strong></div><span className="record-value">{vehicle.climate}</span></div>
            <div className="record"><Gauge size={16} style={{color:'var(--blue)'}} /><div className="record-body"><strong>Пробег</strong></div><span className="record-value">{vehicle.odometer.toLocaleString('ru-RU')} миль</span></div>
            <div className="record"><Wifi size={16} style={{color:'var(--blue)'}} /><div className="record-body"><strong>ПО</strong></div><span className="record-value">{vehicle.software}</span></div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── TRIPS ───────────────────────────────────────────────────────────────────
function TripsView({ vehicle, trips, selectedTrip, selectedIndex, onSelect }: { vehicle: Vehicle; trips: Trip[]; selectedTrip?: Trip; selectedIndex: number; onSelect: (index: number) => void }) {
  const [metric, setMetric] = useState<'battery' | 'speed'>('battery')
  const chartPoints = useMemo(() => (selectedTrip?.points || []).map((point) => ({ ...point, label: timeLabel(point.at) })), [selectedTrip])

  if (!trips.length) {
    return (
      <>
        <div className="page-header"><h1>Поездки</h1><p>История поездок на основе сохранённых snapshots</p></div>
        <EmptyState icon={Route} title="Поездок пока нет" text="Collector ещё не накопил online snapshots в состоянии движения." />
      </>
    )
  }

  return (
    <>
      <div className="page-header"><h1>Поездки</h1><p>Выберите поездку, чтобы увидеть маршрут и статистику</p></div>
      <div className="map-layout">
        {/* Sidebar — trip list */}
        <div className="map-layout-sidebar">
          <div className="map-layout-sidebar-header"><strong>История</strong></div>
          <div className="map-layout-sidebar-body">
            {groupByDay(trips).map(([day, group]) => (
              <div key={day}>
                <div className="day-label">{day}</div>
                <div className="records">
                  {group.map((trip) => {
                    const index = trips.indexOf(trip)
                    return (
                      <button key={trip.startedAt} className={`record ${index === selectedIndex ? 'selected' : ''}`} onClick={() => onSelect(index)}>
                        <span className="record-icon blue"><Route size={15} /></span>
                        <div className="record-body">
                          <strong>{timeLabel(trip.startedAt)} — {timeLabel(trip.endedAt)}</strong>
                          <span>{trip.batteryStart}% → {trip.batteryEnd}% · {minutesLabel(trip.durationMinutes)}</span>
                        </div>
                        <span className="record-value">{trip.distance.toFixed(1)} миль</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="map-layout-map">
          {selectedTrip && vehicle.coordinates ? (
            <LiveMap vehicle={vehicle} route={selectedTrip.route} focusCoordinates={selectedTrip.route[0] || vehicle.coordinates} onSelectAction={() => undefined} />
          ) : (
            <div style={{minHeight:400,display:'grid',placeItems:'center',color:'var(--ink-tertiary)'}}><p>Выберите поездку для отображения маршрута</p></div>
          )}
        </div>
      </div>

      {/* Trip detail */}
      {selectedTrip && (
        <div className="trip-detail">
          <div className="trip-detail-header">
            <strong>Детали поездки</strong>
            <span style={{fontSize:12,color:'var(--ink-tertiary)'}}>{timeLabel(selectedTrip.startedAt)} — {timeLabel(selectedTrip.endedAt)}</span>
          </div>
          <div className="trip-detail-stats">
            <div className="trip-detail-stat"><div className="trip-detail-stat-label">Расстояние</div><div className="trip-detail-stat-value">{selectedTrip.distance.toFixed(1)} <small style={{fontSize:12,fontWeight:400}}>миль</small></div></div>
            <div className="trip-detail-stat"><div className="trip-detail-stat-label">Длительность</div><div className="trip-detail-stat-value">{minutesLabel(selectedTrip.durationMinutes)}</div></div>
            <div className="trip-detail-stat"><div className="trip-detail-stat-label">Ср. скорость</div><div className="trip-detail-stat-value">{selectedTrip.avgSpeed} <small style={{fontSize:12,fontWeight:400}}>миль/ч</small></div></div>
            <div className="trip-detail-stat"><div className="trip-detail-stat-label">Батарея</div><div className="trip-detail-stat-value">{selectedTrip.batteryStart}% → {selectedTrip.batteryEnd}%</div></div>
          </div>
          {chartPoints.length > 1 && (
            <div className="trip-detail-chart">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <span style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--ink-tertiary)'}}>График</span>
                <div className="range-selector">
                  <button className={`range-btn ${metric === 'battery' ? 'active' : ''}`} onClick={() => setMetric('battery')}>Заряд</button>
                  <button className={`range-btn ${metric === 'speed' ? 'active' : ''}`} onClick={() => setMetric('speed')}>Скорость</button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartPoints}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{fontSize:10}} />
                  <YAxis tick={{fontSize:10}} domain={metric === 'battery' ? [0, 100] : undefined} />
                  <Tooltip />
                  <Line type="monotone" dataKey={metric} name={metric === 'battery' ? 'Заряд, %' : 'Скорость'} stroke="var(--blue)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ─── BATTERY ─────────────────────────────────────────────────────────────────
const batteryRanges: Array<[string, number | null]> = [['24ч', 1], ['7д', 7], ['30д', 30], ['90д', 90], ['Все', null]]

function BatteryView({ battery, stats }: { battery: BatteryPoint[]; stats: History['stats'] }) {
  const [range, setRange] = useState<number | null>(7)
  const filtered = useMemo(() => {
    if (range == null || !battery.length) return battery
    const latest = Date.parse(battery[battery.length - 1].at)
    const cutoff = latest - range * 86_400_000
    return battery.filter((point) => Date.parse(point.at) >= cutoff)
  }, [battery, range])

  if (!battery.length) {
    return (
      <>
        <div className="page-header"><h1>Батарея</h1><p>Текущий заряд, тренд и энергопотребление</p></div>
        <EmptyState icon={Battery} title="Данных нет" text="Недостаточно данных для построения графика батареи." />
      </>
    )
  }

  const current = filtered.length ? filtered[filtered.length - 1].battery : battery[battery.length - 1].battery
  const chart = filtered.map((point) => ({ ...point, label: range === 1 ? timeLabel(point.at) : new Intl.DateTimeFormat('ru-RU', {day:'2-digit',month:'short'}).format(new Date(point.at)) }))

  return (
    <>
      <div className="page-header"><h1>Батарея</h1><p>Текущий заряд и тренд из сохранённых snapshots</p></div>

      {/* Hero */}
      <div className="card battery-hero" style={{marginBottom:16}}>
        <div className="hero-big">{current}<small>%</small></div>
        <div className="hero-context">
          <div style={{fontSize:13,color:'var(--ink-secondary)'}}>Текущий заряд</div>
          <div className="hero-context-row">
            <div className="hero-context-item"><span>Минимум</span><strong>{stats?.minimum ?? '—'}%</strong></div>
            <div className="hero-context-item"><span>Максимум</span><strong>{stats?.maximum ?? '—'}%</strong></div>
            <div className="hero-context-item"><span>Разряд</span><strong>{stats?.discharged ?? '—'}%</strong></div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <div className="card-header-title"><span className="card-overline">ИСТОРИЯ</span><span className="card-title">Уровень заряда</span></div>
          <div className="range-selector">
            {batteryRanges.map(([label, value]) => (
              <button key={label} className={`range-btn ${range === value ? 'active' : ''}`} onClick={() => setRange(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{padding:'0 8px 8px'}}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{fontSize:10}} />
              <YAxis domain={[0, 100]} tick={{fontSize:10}} />
              <Tooltip />
              <Line type="monotone" dataKey="battery" name="Заряд, %" stroke="var(--blue)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Health — only if data available */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-title"><span className="card-overline">ЗДОРОВЬЕ</span><span className="card-title">Состояние батареи</span></div>
        </div>
        <div style={{padding:16,fontSize:13,color:'var(--ink-tertiary)'}}>
          <p style={{margin:0}}>Данные о деградации и циклах зарядки недоступны через Owner API.</p>
        </div>
      </div>
    </>
  )
}

// ─── CHARGING ────────────────────────────────────────────────────────────────
function ChargingView({ vehicle, sessions }: { vehicle: Vehicle; sessions: ChargeSession[] }) {
  const isCharging = vehicle.state === 'Charging'

  return (
    <>
      <div className="page-header"><h1>Зарядки</h1><p>Текущая сессия и история зарядок</p></div>

      {/* Current charging hero */}
      {isCharging && (
        <div className="card charging-hero" style={{marginBottom:16,borderColor:'var(--green-border)',background:'var(--green-soft)'}}>
          <div className="hero-big" style={{color:'var(--green)'}}>{vehicle.battery}<small>%</small></div>
          <div className="hero-context">
            <div style={{fontSize:13,color:'var(--ink-secondary)'}}>Сейчас заряжается</div>
            <div className="hero-context-row">
              <div className="hero-context-item"><span>Мощность</span><strong>{vehicle.chargePower ?? '—'}{vehicle.chargePower != null && ' кВт'}</strong></div>
              <div className="hero-context-item"><span>Добавлено</span><strong>{vehicle.energyAdded == null ? '—' : `${vehicle.energyAdded.toFixed(1)} кВт·ч`}</strong></div>
              <div className="hero-context-item"><span>Осталось</span><strong>{vehicle.timeToFullCharge == null ? '—' : minutesLabel(Math.round(vehicle.timeToFullCharge * 60))}</strong></div>
            </div>
            <div style={{marginTop:10,fontSize:12,color:'var(--ink-tertiary)'}}><MapPin size={13} style={{display:'inline',marginRight:4,verticalAlign:'middle'}} />{vehicle.location || 'Локация не передана'}</div>
          </div>
        </div>
      )}

      {/* History */}
      {!sessions.length ? (
        <EmptyState icon={BatteryCharging} title="Зарядок пока нет" text="Collector ещё не накопил периоды зарядки. Запуск cron не будит машину." />
      ) : (
        <div className="card">
          <div className="card-header">
            <div className="card-header-title"><span className="card-overline">ИСТОРИЯ</span><span className="card-title">Зарядки</span></div>
          </div>
          {groupByDay(sessions).map(([day, group]) => (
            <div key={day}>
              <div className="day-label">{day}</div>
              <div className="records">
                {group.map((session) => (
                  <div className="record" key={session.startedAt}>
                    <span className="record-icon green"><BatteryCharging size={15} /></span>
                    <div className="record-body">
                      <strong>{timeLabel(session.startedAt)} — {timeLabel(session.endedAt)}</strong>
                      <span>{session.batteryStart}% → {session.batteryEnd}% · {minutesLabel(session.durationMinutes)}</span>
                    </div>
                    <span className="record-value">{session.energyAdded == null ? '—' : `${session.energyAdded.toFixed(1)} кВт·ч`}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function SettingsView({ name, model }: { name: string; model: string }) {
  return (
    <>
      <div className="page-header"><h1>Настройки</h1><p>Управление подключением и сбором данных</p></div>
      <div className="card">
        <div className="card-header">
          <div className="card-header-title"><span className="card-overline">АВТОМОБИЛЬ</span><span className="card-title">{name}</span></div>
          <span style={{fontSize:12,color:'var(--ink-tertiary)'}}>{model}</span>
        </div>
        <div style={{padding:16,fontSize:13,color:'var(--ink-secondary)'}}>
          <p style={{margin:'0 0 12px'}}>Фоновый collector сначала проверяет состояние через Owner API и сохраняет предыдущие данные, если машина неактивна.</p>
          <p style={{margin:0}}>Сбор данных по умолчанию — <strong>Passive</strong> (пассивный). Автомобиль не будет разбужен без вашего явного подтверждения.</p>
        </div>
      </div>
    </>
  )
}
