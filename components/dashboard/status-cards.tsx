'use client'

import * as React from 'react'
import { Activity, BatteryMedium, Car, DoorClosed, Navigation, PlugZap, Timer, Thermometer, Lock, Unlock, ShieldCheck, Siren, Box, Gauge as GaugeIcon } from 'lucide-react'
import { Card, Figure, Meter, SpeedGauge, Sparkline, StateWord, type Tone } from '@/components/dashboard/cards'
import { VehicleMap, type MapMarker } from '@/components/map/vehicle-map'
import type { ChargingConnection, Trip, VehiclePresence, VehicleStatus } from '@/lib/tesla/models'
import type { PlaceLabel } from '@/lib/geo/place'
import { anyPartOpen } from '@/lib/tesla/models'
import { DASH, formatAge, formatBar, formatDateTimeShort, formatDistanceShort, formatKm, formatKmh, formatKw, formatKwh, formatKwhPer100Km, formatPercent, formatTempCelsius, formatVolts, formatAmps, formatDuration } from '@/lib/format'
import { TIRE_HIGH_PSI, TIRE_LOW_PSI } from '@/lib/tesla/alerts'
import { cn } from '@/lib/utils'

/**
 * The dashboard's cards. One screen, one question: what is the car doing right now.
 *
 * Two rules the whole file obeys.
 *
 * **Read-only.** Nothing here sends anything to the vehicle. The spec this screen was
 * written against bans controls outright, and it happens to be the right call for a
 * display mounted in a car — but the more durable reason is that every element on this
 * surface is a *claim about the car*, and a claim should not also be a button.
 *
 * **No invented numbers.** Several figures in the design brief (remaining kWh, pack
 * temperature, pack voltage and current, cell imbalance, a cellular/Wi-Fi link quality
 * reading) are not reported by the API this app can reach. Those cards say the values
 * are not reported rather than showing a plausible one. The fields that *do* exist are
 * used at full precision.
 */

const PRESENCE_WORD: Record<VehiclePresence, string> = {
  driving: 'Driving',
  parked: 'Parked',
  charging: 'Charging',
  sleeping: 'Sleeping',
  offline: 'Offline',
}

const CONNECTION_WORD: Record<ChargingConnection, string> = {
  charging: 'Charging',
  complete: 'Charge complete',
  stopped: 'Stopped',
  no_power: 'No power',
  disconnected: 'Not connected',
  unknown: 'No reading',
}

/**
 * Tesla's `trim_badging` is a code, not a word. Only the mapping that is documented is
 * applied; anything unrecognised adds nothing to the name rather than guessing at a
 * drivetrain the car may not have.
 */
export function modelBadge(status: VehicleStatus): string {
  const base = status.displayName
  const trim = status.config.trimBadging
  const performance = /perf/i.test(trim ?? '') || status.config.performancePackage === true
  if (!performance) return base
  return base.includes('Performance') ? base : `${base} Performance`
}

/* ── Header ──────────────────────────────────────────────────────────────── */

export function DashboardHeader({ status, ageSeconds, onResetLayout }: { status: VehicleStatus; ageSeconds: number; onResetLayout?: () => void }) {
  const link: { word: string; tone: Tone } =
    status.connectivity === 'online' ? { word: 'Connected', tone: 'ok' } : status.connectivity === 'asleep' ? { word: 'Asleep', tone: 'warn' } : { word: 'Offline', tone: 'muted' }

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-3">
      <h1 className="min-w-0 truncate text-[19px] font-semibold tracking-[-0.02em] text-ink sm:text-[22px]">{modelBadge(status)}</h1>
      <span className="flex items-center gap-1.5 text-[12.5px] text-ink-secondary">
        <span className={cn('size-2 rounded-full', link.tone === 'ok' ? 'bg-ok' : link.tone === 'warn' ? 'bg-warn' : 'bg-ink-tertiary')} aria-hidden />
        {link.word}
      </span>
      <span className="ml-auto font-mono text-[12px] text-ink-tertiary">Updated {Number.isFinite(ageSeconds) ? formatAge(ageSeconds) : DASH}</span>
      {/* The one control on this screen, and it addresses the page rather than the car: it
          forgets the arrangement the operator dragged together. Only offered once there is
          an arrangement to forget, so the glanceable default stays free of a button that
          would do nothing. */}
      {onResetLayout && (
        <button type="button" onClick={onResetLayout} className="h-7 rounded-md border border-line px-2.5 text-[11.5px] font-medium text-ink-secondary transition hover:bg-surface-muted hover:text-ink">
          Reset layout
        </button>
      )}
    </header>
  )
}

/* ── Vehicle ─────────────────────────────────────────────────────────────── */

export function VehicleCard({ status, place }: { status: VehicleStatus; place: PlaceLabel | null }) {
  const hasPosition = status.drive.latitude !== null && status.drive.longitude !== null
  const where = place?.label ?? (hasPosition ? 'Position reported, place unknown' : 'No position reported')

  return (
    <Card icon={Car} title="Vehicle" aside={<StateWord tone={status.presence === 'driving' || status.presence === 'charging' ? 'ok' : 'muted'}>{PRESENCE_WORD[status.presence]}</StateWord>}>
      <div className="vehicle-stage -mx-1 flex items-center justify-center">
        {/* The render is a stand-in for the body style, not a picture of this car: it is
            the same silhouette whatever the vehicle's actual paint, so it never claims a
            colour the API did not report. */}
        {/*
          A plain <img>, deliberately. The asset is already cropped and encoded at the
          two widths it is ever shown at (scripts/build-assets.mjs), so next/image would
          add a /_next/image round-trip in front of it and save nothing — on the car's
          own connection that is pure latency. Dimensions are explicit, so there is no
          layout shift to optimize away either.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vehicle/model-y.webp"
          srcSet="/vehicle/model-y.webp 1x, /vehicle/model-y@2x.webp 2x"
          width={640}
          height={307}
          alt=""
          aria-hidden
          className="h-auto w-full max-w-[340px] select-none"
          draggable={false}
        />
      </div>

      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-5 text-ink">{status.displayName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-secondary">
            <Navigation className="size-3 shrink-0 text-ink-tertiary" aria-hidden />
            <span className="truncate">{where}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[20px] font-semibold leading-6 tracking-[-0.02em] text-ink tabular-nums">{formatKmh(status.drive.speedKmh ?? 0)}</p>
          <p className="text-[11px] text-ink-tertiary">
            {status.state.odometerKm !== null ? `${formatKm(status.state.odometerKm)} total` : 'odometer not reported'}
          </p>
        </div>
      </div>
    </Card>
  )
}

/* ── Battery ─────────────────────────────────────────────────────────────── */

export function BatteryCard({ status }: { status: VehicleStatus }) {
  const charge = status.charge
  const soc = charge.stateOfCharge
  const low = soc !== null && soc <= 20
  const range = charge.ratedRangeKm ?? charge.estimatedRangeKm
  // `usable_battery_level` differs from `battery_level` when the pack is near full or
  // cold; showing both when they agree would be noise, so it appears only when they do not.
  const usableGap = charge.usableStateOfCharge !== null && soc !== null && Math.abs(charge.usableStateOfCharge - soc) >= 2

  return (
    <Card icon={BatteryMedium} title="Battery" aside={charge.chargeLimitPercent !== null ? <span>limit {charge.chargeLimitPercent}%</span> : undefined}>
      <Figure value={soc === null ? DASH : soc} unit="%" tone={low ? 'warn' : 'ink'} label={range !== null ? `${formatDistanceShort(range)} range` : 'range not reported'} />
      <div className="mt-3">
        <Meter percent={soc} tone={low ? 'warn' : 'ok'} mark={charge.chargeLimitPercent} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
        {usableGap && (
          <span className="text-ink-tertiary">
            Usable <span className="font-mono text-ink">{formatPercent(charge.usableStateOfCharge)}</span>
          </span>
        )}
        {charge.estimatedRangeKm !== null && charge.ratedRangeKm !== null && (
          <span className="text-ink-tertiary">
            Estimated <span className="font-mono text-ink">{formatDistanceShort(charge.estimatedRangeKm)}</span>
          </span>
        )}
        {soc === null && range === null && <span className="text-ink-tertiary">The vehicle reported no charge state in this snapshot.</span>}
      </div>
    </Card>
  )
}

/* ── Realtime ────────────────────────────────────────────────────────────── */

export function RealtimeCard({ status }: { status: VehicleStatus }) {
  const shift = status.drive.shiftState
  return (
    <Card icon={GaugeIcon} title="Realtime" aside={shift !== 'unknown' ? <span>gear {shift}</span> : undefined}>
      <div className="flex items-center gap-4">
        <SpeedGauge value={status.drive.speedKmh} />
        <dl className="min-w-0 flex-1 space-y-2.5">
          <FigureLine label="Speed" value={formatKmh(status.drive.speedKmh)} />
          <FigureLine label="Motor power" value={status.drive.powerKw === null ? 'not reported' : formatKw(status.drive.powerKw)} />
          <FigureLine label="Heading" value={status.drive.heading === null ? DASH : `${Math.round(status.drive.heading)}°`} />
        </dl>
      </div>
    </Card>
  )
}

function FigureLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[16px] font-medium text-ink tabular-nums">{value}</dd>
    </div>
  )
}

/* ── Location ────────────────────────────────────────────────────────────── */

export function LocationCard({ status, place, ageSeconds }: { status: VehicleStatus; place: PlaceLabel | null; ageSeconds: number }) {
  const has = status.drive.latitude !== null && status.drive.longitude !== null
  const markers = React.useMemo<MapMarker[]>(() => {
    if (!has) return []
    return [{ id: 'vehicle', kind: 'vehicle', longitude: status.drive.longitude!, latitude: status.drive.latitude!, label: status.displayName, heading: status.drive.heading, presence: status.presence }]
  }, [status, has])

  return (
    <Card
      icon={Navigation}
      title="Location"
      aside={has ? <span>{Number.isFinite(ageSeconds) ? formatAge(ageSeconds) : DASH}</span> : undefined}
      contentClassName="space-y-3"
    >
      <VehicleMap
        markers={markers}
        className="h-[210px] w-full sm:h-[240px]"
        placeholder={
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="max-w-[300px] text-[12.5px] leading-5 text-ink-tertiary">
              The vehicle is not reporting a position. It will appear here as soon as one is in the snapshot — the map is not loaded to draw an empty world.
            </p>
          </div>
        }
      />
      <div className="min-w-0 shrink-0">
        <p className="truncate text-[15px] font-semibold leading-5 text-ink">
          {place?.city ?? place?.label ?? (has ? 'Place not resolved' : 'No position')}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-secondary">
          {place ? [place.district, place.postcode, place.country].filter(Boolean).join(' · ') || 'Last known location' : has ? 'Last known location' : 'Waiting for a fix'}
        </p>
        {has && (
          <p className="mt-1 font-mono text-[11.5px] text-ink-tertiary">
            {status.drive.latitude!.toFixed(5)}, {status.drive.longitude!.toFixed(5)}
          </p>
        )}
      </div>
    </Card>
  )
}

/* ── Charging ────────────────────────────────────────────────────────────── */

export function ChargingCard({ status }: { status: VehicleStatus }) {
  const charge = status.charge
  const active = charge.chargingConnection === 'charging'

  return (
    <Card icon={PlugZap} title="Charging" aside={<StateWord tone={active ? 'ok' : 'muted'}>{CONNECTION_WORD[charge.chargingConnection]}</StateWord>}>
      {active ? (
        <>
          <Figure value={charge.chargerPowerKw ?? DASH} unit="kW" label={charge.minutesToFullCharge !== null ? `${formatDuration(charge.minutesToFullCharge)} to full` : 'time to full not reported'} />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            <Mini label="Added" value={charge.chargeSessionAddedRangeKm !== null ? `+${formatDistanceShort(charge.chargeSessionAddedRangeKm)}` : DASH} />
            <Mini label="Energy" value={charge.chargeSessionEnergyAddedKwh !== null ? formatKwh(charge.chargeSessionEnergyAddedKwh) : DASH} />
            <Mini label="Voltage" value={charge.chargerVoltage !== null ? formatVolts(charge.chargerVoltage) : DASH} />
            <Mini label="Current" value={charge.chargerActualCurrentA !== null ? formatAmps(charge.chargerActualCurrentA) : DASH} />
          </div>
          <p className="mt-2.5 text-[11.5px] leading-4 text-ink-tertiary">
            Voltage and current are the {charge.fastChargerPresent ? 'DC supply at the connector' : 'AC side reported by the charger'}; the traction pack itself is not exposed here.
          </p>
        </>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[15px] font-semibold text-ink">{CONNECTION_WORD[charge.chargingConnection]}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            <Mini label="Power" value={formatKw(charge.chargerPowerKw)} />
            <Mini label="Port" value={charge.chargePortOpen === null ? DASH : charge.chargePortOpen ? 'Open' : 'Closed'} />
            {charge.chargeSessionEnergyAddedKwh !== null && charge.chargeSessionEnergyAddedKwh > 0 && (
              <Mini label="Last session" value={formatKwh(charge.chargeSessionEnergyAddedKwh)} />
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-ink-tertiary">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[13.5px] text-ink tabular-nums">{value}</p>
    </div>
  )
}

/* ── Climate ────────────────────────────────────────────────────────────── */

export function ClimateCard({ status }: { status: VehicleStatus }) {
  const climate = status.climate
  const on = climate.climateOn === true
  return (
    <Card icon={Thermometer} title="Climate" aside={<StateWord tone={on ? 'ok' : 'muted'}>HVAC {on ? 'On' : climate.climateOn === null ? 'unknown' : 'Off'}</StateWord>}>
      <div className="grid grid-cols-2 gap-4">
        <Figure size="lg" value={tempNumber(climate.insideTempC)} unit="°C" label="Cabin" />
        <Figure size="lg" value={tempNumber(climate.outsideTempC)} unit="°C" label="Outside" />
      </div>
      {(climate.driverTempSettingC !== null || climate.isPreconditioning) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-2.5 text-[12.5px] text-ink-tertiary">
          {climate.driverTempSettingC !== null && (
            <span>
              Set to <span className="font-mono text-ink">{formatTempCelsius(climate.driverTempSettingC)}</span>
            </span>
          )}
          {climate.isPreconditioning && <span>Preconditioning</span>}
          {climate.batteryHeaterOn && <span>Battery heater on</span>}
        </div>
      )}
    </Card>
  )
}

/** `Figure` wants a bare number; the unit is rendered beside it. */
function tempNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return DASH
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: Math.abs(value) < 10 ? 1 : 0, maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 }).format(value)
}

/* ── Vehicle health ──────────────────────────────────────────────────────── */

export function HealthCard({ status }: { status: VehicleStatus }) {
  const state = status.state
  const doors = anyPartOpen(state.doors)
  const windows = anyPartOpen(state.windows)

  const rows: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: Tone; dot: Tone }> = [
    { icon: state.locked === false ? Unlock : Lock, label: 'Lock', value: word(state.locked, 'Locked', 'Unlocked'), tone: state.locked === false ? 'warn' : 'ink', dot: state.locked === false ? 'warn' : 'muted' },
    { icon: DoorClosed, label: 'Doors', value: partWord(doors, 'Closed', 'Open'), tone: doors ? 'warn' : 'ink', dot: doors ? 'warn' : 'ok' },
    { icon: WindowIcon, label: 'Windows', value: partWord(windows, 'Closed', 'Open'), tone: windows ? 'warn' : 'ink', dot: windows ? 'warn' : 'ok' },
    { icon: Box, label: 'Trunk', value: boolWord(state.trunkRearOpen, 'Closed', 'Open'), tone: state.trunkRearOpen ? 'warn' : 'ink', dot: state.trunkRearOpen ? 'warn' : 'ok' },
    { icon: Box, label: 'Frunk', value: boolWord(state.trunkFrontOpen, 'Closed', 'Open'), tone: state.trunkFrontOpen ? 'warn' : 'ink', dot: state.trunkFrontOpen ? 'warn' : 'ok' },
    { icon: Siren, label: 'Sentry', value: boolWord(state.sentryMode, 'Armed', 'Off'), tone: 'ink', dot: state.sentryMode ? 'warn' : 'muted' },
  ]

  return (
    <Card icon={ShieldCheck} title="Vehicle health" contentClassName="divide-y divide-line">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2.5 py-[7px]">
          <row.icon className="size-[15px] shrink-0 text-ink-tertiary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-secondary">{row.label}</span>
          <span className={cn('shrink-0 text-[13px] font-medium', row.tone === 'warn' ? 'text-warn' : 'text-ink')}>{row.value}</span>
        </div>
      ))}
      {doors === null && windows === null && state.locked === null && (
        <p className="pt-2 text-[11.5px] leading-4 text-ink-tertiary">The vehicle reported no body-state fields in this snapshot, so every row above reads “not reported”.</p>
      )}
    </Card>
  )
}

/** lucide has no four-window glyph; a plain frame reads better than a wrong icon. */
function WindowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
      <path d="M12 6.5v11" />
    </svg>
  )
}

function word(value: boolean | null | undefined, whenTrue: string, whenFalse: string): string {
  if (value === null || value === undefined) return 'Not reported'
  return value ? whenTrue : whenFalse
}

function boolWord(value: boolean | null, whenTrue: string, whenFalse: string): string {
  return word(value, whenTrue, whenFalse)
}

function partWord(value: boolean | null, whenClosed: string, whenOpen: string): string {
  return word(value, whenOpen, whenClosed)
}

/* ── Battery health ──────────────────────────────────────────────────────── */

export function BatteryHealthCard({ status }: { status: VehicleStatus }) {
  const charge = status.charge
  const charging = charge.chargingConnection === 'charging'

  return (
    <Card icon={Activity} title="Battery health">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Mini label="12 V battery" value={status.state.lowVoltageBatteryVolts !== null ? `${status.state.lowVoltageBatteryVolts.toFixed(1)} V` : 'not reported'} />
        <Mini label="Battery heater" value={charge.batteryHeaterOn === null ? 'not reported' : charge.batteryHeaterOn ? 'On' : 'Off'} />
        <Mini label="Charger voltage" value={charging && charge.chargerVoltage !== null ? formatVolts(charge.chargerVoltage) : 'idle'} />
        <Mini label="Charger current" value={charging && charge.chargerActualCurrentA !== null ? formatAmps(charge.chargerActualCurrentA) : 'idle'} />
      </div>
      {/* Named explicitly because the brief asked for them and they do not exist here.
          A blank card would read as a bug; this reads as a boundary. */}
      <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-4 text-ink-tertiary">
        Pack temperature, pack voltage, pack current and cell imbalance are not in the vehicle data Tesla returns to this app. They are per-cell telemetry and arrive with
        Fleet Telemetry, not with a status read.
      </p>
    </Card>
  )
}

/* ── Energy ──────────────────────────────────────────────────────────────── */

export function EnergyCard({ trips }: { trips: Trip[] }) {
  // The feed is newest-first; reversed here so the line reads left to right through time.
  const series = React.useMemo(() => trips.filter((trip) => trip.endedAt).slice(0, 12).reverse(), [trips])
  const values = series.map((trip) => trip.efficiencyWhPerKm)
  const newest = series.length ? series[series.length - 1] : null
  const last = newest?.efficiencyWhPerKm ?? null
  const measured = values.filter((value): value is number => value !== null && Number.isFinite(value))
  const average = measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null

  return (
    <Card icon={Timer} title="Energy" aside={series.length > 1 ? <span>{series.length} recent trips</span> : undefined}>
      <Figure
        size="lg"
        value={last === null ? DASH : (last / 10).toFixed(1)}
        unit="kWh/100 km"
        label={newest && last !== null ? `Last completed trip · ${formatDateTimeShort(newest.endedAt)}` : 'No completed trip measured yet'}
      />
      <div className="mt-2">
        <Sparkline values={values} />
      </div>
      {newest === null ? (
        <p className="text-[11.5px] leading-4 text-ink-tertiary">Consumption is measured per trip, from the energy the pack lost over the distance driven.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-2 text-[11.5px] text-ink-tertiary">
          <span>{average === null ? 'Average unavailable' : `${formatKwhPer100Km(average)} average over ${measured.length} trip${measured.length === 1 ? '' : 's'}`}</span>
          {newest.distanceKm != null && <span>{formatDistanceShort(newest.distanceKm)} on the last one</span>}
        </div>
      )}
    </Card>
  )
}

/* ── Tyres ───────────────────────────────────────────────────────────────── */

export function TyreCard({ status }: { status: VehicleStatus }) {
  const pressures = status.state.tirePressurePsi
  const wheels: Array<{ key: keyof NonNullable<typeof pressures>; label: string }> = [
    { key: 'frontLeft', label: 'FL' },
    { key: 'frontRight', label: 'FR' },
    { key: 'rearLeft', label: 'RL' },
    { key: 'rearRight', label: 'RR' },
  ]
  const stale = pressures === null

  return (
    <Card icon={GaugeIcon} title="Tyre pressure" aside={stale ? <span>not reported</span> : undefined}>
      <div className="grid grid-cols-2 gap-2.5">
        {wheels.map((wheel) => {
          const psi = pressures?.[wheel.key] ?? null
          const off = psi !== null && (psi < TIRE_LOW_PSI || psi > TIRE_HIGH_PSI)
          return (
            <div key={wheel.key} className={cn('rounded-lg border px-3 py-2.5', off ? 'border-warn-line bg-warn-soft' : 'border-line bg-surface-muted/60')}>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-tertiary">{wheel.label}</p>
              <p className={cn('mt-0.5 font-mono text-[17px] font-semibold leading-6 tabular-nums', off ? 'text-warn' : 'text-ink')}>
                {psi === null ? DASH : formatBar(psi)}
              </p>
            </div>
          )
        })}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-4 text-ink-tertiary">
        {stale
          ? 'The vehicle reports tyre pressure only after the sensors have woken, so a car that has been asleep for a while shows nothing here.'
          : `Highlighted outside ${formatBar(TIRE_LOW_PSI)}–${formatBar(TIRE_HIGH_PSI)}, the same band the alerts use. Cold inflation for this car is about ${formatBar(42)}.`}
      </p>
    </Card>
  )
}

export { PRESENCE_WORD }
