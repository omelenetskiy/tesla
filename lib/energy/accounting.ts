/**
 * Verified energy accounting for telemetry sessions.
 *
 * Energy is integrated only from measured power (or voltage/current). SOC is
 * intentionally not used as an energy source: it is a state estimate, not a
 * calibrated power meter (§65).
 */

export type EnergyActivity = 'driving' | 'parked' | 'charging'

export type PowerSample = {
  timestamp: string | number | Date
  powerKw?: number | null
  voltageV?: number | null
  currentA?: number | null
  activity?: EnergyActivity | null
}

export type EnergyAccounting = {
  consumedDrivingKwh: number | null
  consumedParkedKwh: number | null
  chargedKwh: number | null
  regeneratedKwh: number | null
  coverage: {
    startTime: Date
    endTime: Date
    gainsMs: number
    coveragePercent: number
  }
  verified: boolean
  gapFlags: string[]
}

export const DEFAULT_MAX_GAP_MS = 5 * 60 * 1000

function timestampMs(value: PowerSample['timestamp']): number | null {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function roundKwh(value: number): number {
  return Math.round(value * 1000) / 1000
}

function estimatePowerKw(sample: PowerSample): number | null {
  if (finite(sample.powerKw)) return sample.powerKw
  if (finite(sample.voltageV) && finite(sample.currentA)) return (sample.voltageV * sample.currentA) / 1000
  return null
}

function invalidSample(sample: PowerSample): boolean {
  return (
    (sample.voltageV !== undefined && sample.voltageV !== null && (!finite(sample.voltageV) || sample.voltageV < 0)) ||
    (sample.currentA !== undefined && sample.currentA !== null && (!finite(sample.currentA) || Math.abs(sample.currentA) > 1000)) ||
    (sample.powerKw !== undefined && sample.powerKw !== null && !finite(sample.powerKw))
  )
}

/** Returns a verified result, or null when the period cannot be trusted. */
export function computeEnergyForSession(
  samples: PowerSample[],
  maxGapMs = DEFAULT_MAX_GAP_MS,
): EnergyAccounting | null {
  if (samples.length < 2 || !Number.isFinite(maxGapMs) || maxGapMs <= 0) return null

  const times = samples.map((sample) => timestampMs(sample.timestamp))
  if (times.some((time) => time === null) || samples.some(invalidSample)) return null

  const startMs = times[0] as number
  const endMs = times[times.length - 1] as number
  if (endMs <= startMs) return null

  let chargedKwh = 0
  let regeneratedKwh = 0
  let gainsMs = 0
  const gapFlags: string[] = []

  for (let index = 1; index < samples.length; index += 1) {
    const previousTime = times[index - 1] as number
    const currentTime = times[index] as number
    const intervalMs = currentTime - previousTime
    if (intervalMs <= 0) return null
    if (intervalMs > maxGapMs) {
      gapFlags.push(`large_gap_${previousTime}_${currentTime}`)
      continue
    }

    const powerKw = estimatePowerKw(samples[index])
    if (powerKw === null) continue

    gainsMs += intervalMs
    const energyKwh = powerKw * (intervalMs / 3_600_000)
    if (energyKwh > 0) {
      chargedKwh += energyKwh
    } else if (energyKwh < 0) {
      regeneratedKwh += Math.abs(energyKwh)
    }
  }

  if (gapFlags.length > 0) return null

  const totalMs = endMs - startMs
  return {
    // The telemetry sign convention exposes charging/regen, not motor load.
    // Do not fabricate driving/parked consumption from SOC or battery capacity.
    consumedDrivingKwh: null,
    consumedParkedKwh: null,
    chargedKwh: roundKwh(chargedKwh),
    regeneratedKwh: roundKwh(regeneratedKwh),
    coverage: {
      startTime: new Date(startMs),
      endTime: new Date(endMs),
      gainsMs,
      coveragePercent: roundKwh((gainsMs / totalMs) * 100),
    },
    verified: true,
    gapFlags,
  }
}

/** Returns the intervals that would make a session unverifiable. */
export function identifyLargeGaps(samples: PowerSample[], maxGapMs = DEFAULT_MAX_GAP_MS): string[] {
  const times = samples.map((sample) => timestampMs(sample.timestamp))
  if (times.some((time) => time === null)) return ['invalid_timestamp']
  const flags: string[] = []
  for (let index = 1; index < times.length; index += 1) {
    const previous = times[index - 1] as number
    const current = times[index] as number
    if (current - previous > maxGapMs) flags.push(`large_gap_${previous}_${current}`)
  }
  return flags
}


