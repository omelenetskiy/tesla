import type { Vehicle } from '@/app/data'
import type { ChargingSession, Trip, VehicleStatus } from './models'

/**
 * TEMPORARY — delete in PHASE 8.
 *
 * The current `app/page.tsx` reads the pre-redesign payload (`vehicle.battery`,
 * `history.trips[].distance`, …). Rather than break it while the new layer lands,
 * the new routes emit this projection alongside the real models. The new UI never
 * imports from here; once the dashboard is rebuilt, the `legacy` fields and this
 * whole module go away together.
 */

function presenceToLegacy(state: VehicleStatus['presence']): Vehicle['state'] {
  if (state === 'driving') return 'Driving'
  if (state === 'charging') return 'Charging'
  return 'Parked'
}

function freshnessToLegacy(seconds: number): Vehicle['freshness'] {
  if (seconds <= 30) return 'LIVE'
  if (seconds <= 300) return 'RECENT'
  return seconds <= 900 ? 'STALE' : 'OFFLINE'
}

export function legacyVehicleFromStatus(status: VehicleStatus, fallbackName: string, ageSeconds: number): Vehicle {
  const coordinates: [number, number] | null =
    typeof status.drive.latitude === 'number' && typeof status.drive.longitude === 'number'
      ? [status.drive.longitude, status.drive.latitude]
      : null
  return {
    id: status.identity.ownerApiId || status.identity.databaseId,
    name: status.displayName || fallbackName,
    model: status.config.displayModel ?? status.displayName ?? 'Tesla',
    color: status.config.exteriorColor ?? '#2f80ed',
    state: presenceToLegacy(status.presence),
    battery: status.charge.stateOfCharge ?? 0,
    range: Math.round(status.charge.ratedRangeKm ?? 0),
    speed: Math.round(status.drive.speedKmh ?? 0),
    location: coordinates ? 'Последнее известное местоположение' : null,
    coordinates,
    odometer: Math.round(status.state.odometerKm ?? 0),
    chargingState: status.charge.chargingConnection === 'charging' ? 'Charging' : status.charge.chargingConnection === 'complete' ? 'Complete' : 'Not charging',
    energyAdded: status.charge.chargeSessionEnergyAddedKwh,
    chargePower: status.charge.chargerPowerKw,
    timeToFullCharge: status.charge.minutesToFullCharge !== null ? Math.round(status.charge.minutesToFullCharge / 6) / 10 : null,
    climate: status.climate.insideTempC === null ? 'Off' : `${Math.round(status.climate.insideTempC * 10) / 10}°C`,
    lockState: status.state.locked === true ? 'Заперта' : status.state.locked === false ? 'Открыта' : 'Недоступно',
    connectivity: status.connectivity === 'online' ? 'Connected' : status.connectivity === 'asleep' ? 'Asleep' : 'No signal',
    software: status.state.softwareVersion ?? 'Unavailable',
    // Recomputed from the row's real age — the old code baked "just now" into storage.
    lastUpdated: `${ageSeconds} с назад`,
    freshness: freshnessToLegacy(ageSeconds),
    health: 'Healthy',
    healthNote: 'Снимок получен из Tesla Owner API',
  }
}

export type LegacyHistory = {
  battery: Array<{ at: string; battery: number; range: number; charging: string }>
  charging: Array<{ startedAt: string; endedAt: string; batteryStart: number; batteryEnd: number; energyAdded: number | null; peakPower: number | null; durationMinutes: number }>
  trips: Array<{ startedAt: string; endedAt: string; odometerStart: number; odometerEnd: number; distance: number; route: [number, number][]; batteryStart: number; batteryEnd: number; durationMinutes: number; avgSpeed: number; maxSpeed: number; points: Array<{ at: string; battery: number; speed: number }> }>
  stats: { current: number; minimum: number; maximum: number; discharged: number; snapshots: number } | null
}

export function legacyHistoryFromBundle(input: {
  battery: Array<{ at: string; stateOfCharge: number | null; ratedRangeKm: number | null; chargingConnection: string }>
  trips: Trip[]
  charging: ChargingSession[]
}): LegacyHistory {
  const battery = input.battery
    .filter((point) => point.stateOfCharge !== null)
    .map((point) => ({
      at: point.at,
      battery: point.stateOfCharge as number,
      range: Math.round(point.ratedRangeKm ?? 0),
      charging: point.chargingConnection === 'charging' ? 'Charging' : 'Not charging',
    }))
  const values = battery.map((point) => point.battery)
  return {
    battery,
    charging: input.charging.map((session) => ({
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? session.startedAt,
      batteryStart: session.batteryStartPercent ?? 0,
      batteryEnd: session.batteryEndPercent ?? 0,
      energyAdded: session.energyAddedKwh,
      peakPower: session.peakPowerKw,
      durationMinutes: session.durationMinutes ?? 0,
    })),
    trips: input.trips.map((trip) => ({
      startedAt: trip.startedAt,
      endedAt: trip.endedAt ?? trip.startedAt,
      odometerStart: Math.round(trip.odometerStartKm ?? 0),
      odometerEnd: Math.round(trip.odometerEndKm ?? 0),
      distance: Math.round(trip.distanceKm ?? 0),
      route: trip.route,
      batteryStart: trip.batteryStartPercent ?? 0,
      batteryEnd: trip.batteryEndPercent ?? 0,
      durationMinutes: trip.durationMinutes ?? 0,
      avgSpeed: Math.round(trip.averageSpeedKmh ?? 0),
      maxSpeed: Math.round(trip.maxSpeedKmh ?? 0),
      // The legacy chart wants a per-point series; rebuilt from the trip's own window.
      points: trip.route.length
        ? [{ at: trip.startedAt, battery: trip.batteryStartPercent ?? 0, speed: trip.averageSpeedKmh ?? 0 }]
        : [],
    })),
    stats: values.length
      ? {
          current: values.at(-1) as number,
          minimum: Math.min(...values),
          maximum: Math.max(...values),
          discharged: Math.max(0, (values[0] as number) - (values.at(-1) as number)),
          snapshots: values.length,
        }
      : null,
  }
}
