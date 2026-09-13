import { anyPartOpen } from './models'
import type { VehicleStatus, VehicleStatusSnapshot } from './models'

/**
 * Vehicle alerts, derived from what the Fleet API actually reports about the car.
 *
 * Deliberately vehicle-only: integration problems (a 403, a failed request) belong to
 * the API console and the Alerts page has no business mixing them in, because a
 * driver reading this screen is asking "is something wrong with the car?".
 *
 * Tesla exposes no fault codes, so an "alert" here is a condition the telemetry
 * genuinely shows — service mode engaged, a tyre below pressure, the 12 V cell
 * sagging, charging refused for lack of power. Anything the API does not say is
 * absent rather than guessed, and each row names the field it came from so a wrong
 * reading is traceable.
 */

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type VehicleAlert = {
  id: string
  severity: AlertSeverity
  title: string
  detail: string | null
  /** The telemetry field this came from, shown so the claim is checkable. */
  source: string
}

const SERVICE_MODE_LABEL: Record<number, string> = {
  1: 'Service scheduled',
  2: 'Roadside assistance requested',
  3: 'In repair',
}

/** Typical Tesla cold inflation is ~42 psi; these bands are deliberately generous. */
export const TIRE_LOW_PSI = 29
export const TIRE_HIGH_PSI = 55

export function deriveAlerts(snapshot: VehicleStatusSnapshot | null): VehicleAlert[] {
  const alerts: VehicleAlert[] = []
  const status = snapshot?.status ?? null

  if (!status) {
    if (snapshot && snapshot.freshness === 'offline') {
      alerts.push({ id: 'stale', severity: 'warning', title: 'The car has not reported recently', detail: 'No current snapshot is available.', source: 'vehicle_states.collected_at' })
    }
    return alerts
  }

  const { state, charge, drive, climate } = status

  if (state.serviceMode !== null && state.serviceMode > 0) {
    alerts.push({
      id: 'service-mode',
      severity: state.serviceMode === 3 ? 'critical' : 'warning',
      title: SERVICE_MODE_LABEL[state.serviceMode] ?? `Service mode ${state.serviceMode}`,
      detail: null,
      source: 'vehicle_state.service_mode',
    })
  }

  if (state.lowVoltageBatteryVolts !== null && state.lowVoltageBatteryVolts < 11.6) {
    alerts.push({
      id: 'low-voltage',
      severity: state.lowVoltageBatteryVolts < 11 ? 'critical' : 'warning',
      title: '12 V battery voltage low',
      detail: `${state.lowVoltageBatteryVolts.toFixed(2)} V`,
      source: 'vehicle_state.est_12v_battery_voltage',
    })
  }

  const pressures = state.tirePressurePsi
  if (pressures) {
    const named = [
      ['frontLeft', 'Front left'],
      ['frontRight', 'Front right'],
      ['rearLeft', 'Rear left'],
      ['rearRight', 'Rear right'],
    ] as const
    for (const [key, label] of named) {
      const psi = pressures[key]
      if (psi === null) continue
      if (psi < TIRE_LOW_PSI || psi > TIRE_HIGH_PSI) {
        alerts.push({
          id: `tire-${key}`,
          severity: psi < 25 || psi > 60 ? 'critical' : 'warning',
          title: `${label} tyre pressure ${psi < TIRE_LOW_PSI ? 'low' : 'high'}`,
          detail: `${psi} psi`,
          source: 'vehicle_state.tire_pressure_psi',
        })
      }
    }
  }

  const openParts = [
    anyPartOpen(state.doors) && 'Doors',
    anyPartOpen(state.windows) && 'Windows',
    state.trunkFrontOpen && 'Frunk',
    state.trunkRearOpen && 'Trunk',
  ].filter(Boolean) as string[]
  if (openParts.length && status.presence !== 'driving') {
    alerts.push({
      id: 'open',
      severity: 'warning',
      title: `${openParts.join(', ')} open`,
      detail: null,
      source: 'vehicle_state.df/dr/pf/pr, *_window, ft, rt',
    })
  }

  if (charge.chargingConnection === 'no_power') {
    alerts.push({ id: 'no-power', severity: 'warning', title: 'Charging stopped: no power', detail: 'The connector reports no supply.', source: 'charge_state.charging_state' })
  } else if (charge.chargingConnection === 'stopped') {
    alerts.push({ id: 'charge-stopped', severity: 'info', title: 'Charging stopped', detail: null, source: 'charge_state.charging_state' })
  }

  if (charge.notEnoughPowerToHeat === true) {
    alerts.push({ id: 'heat', severity: 'warning', title: 'Not enough power to heat the cabin', detail: null, source: 'charge_state.not_enough_power_to_heat' })
  }

  if (charge.stateOfCharge !== null && charge.stateOfCharge <= 20 && charge.chargingConnection !== 'charging' && status.presence !== 'sleeping') {
    alerts.push({ id: 'low-soc', severity: charge.stateOfCharge <= 10 ? 'critical' : 'warning', title: 'Battery low', detail: `${charge.stateOfCharge}%`, source: 'charge_state.battery_level' })
  }

  if (state.updateStatus && state.updateStatus !== 'installed') {
    alerts.push({ id: 'update', severity: 'info', title: `Software update ${state.updateStatus}`, detail: state.updateVersion, source: 'vehicle_state.software_update' })
  }

  if (state.sentryMode) alerts.push({ id: 'sentry', severity: 'info', title: 'Sentry mode is on', detail: 'Extra energy drain while parked.', source: 'vehicle_state.sentry_mode' })
  if (state.valetMode) alerts.push({ id: 'valet', severity: 'info', title: 'Valet mode is on', detail: null, source: 'vehicle_state.valet_mode' })
  if (climate.isPreconditioning) alerts.push({ id: 'precond', severity: 'info', title: 'Cabin preconditioning', detail: null, source: 'climate_state.is_preconditioning' })

  if (snapshot && snapshot.freshness === 'stale') {
    alerts.push({ id: 'stale', severity: 'info', title: 'Snapshot is ageing', detail: 'The vehicle has not reported recently.', source: 'vehicle_states.collected_at' })
  }

  if (drive.shiftState === 'unknown' && status.presence === 'driving') {
    alerts.push({ id: 'shift', severity: 'info', title: 'Gear position not reported', detail: null, source: 'drive_state.shift_state' })
  }

  const rank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity])
}

export function countBySeverity(alerts: VehicleAlert[]): Record<AlertSeverity, number> {
  return alerts.reduce<Record<AlertSeverity, number>>(
    (counts, alert) => {
      counts[alert.severity] += 1
      return counts
    },
    { critical: 0, warning: 0, info: 0 },
  )
}
