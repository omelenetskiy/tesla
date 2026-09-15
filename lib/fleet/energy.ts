/**
 * Energy Accounting Module
 * Verifies energy counters and prevents calculation errors
 */

export interface EnergyReading {
  timestamp: string
  soc_kwh: number // State of charge in kWh
  battery_capacity_kwh: number
  power_kw: number // Positive = charging, negative = discharging
  is_charging: boolean
}

export interface EnergySession {
  startTime: string
  endTime: string
  initialSoc: number
  finalSoc: number
  energyConsumed: number
  energyRecovered: number
  netEnergy: number
  duration: number // seconds
  isValid: boolean
  validationErrors: string[]
}

/**
 * Calculate energy consumption from power samples
 * Rejects calculations across large time gaps (missing data)
 */
export function calculateEnergyFromPower(
  readings: EnergyReading[],
  maxGapSeconds: number = 300
): EnergySession | null {
  if (readings.length < 2) return null

  const validationErrors: string[] = []
  const session: Partial<EnergySession> = {
    startTime: readings[0].timestamp,
    endTime: readings[readings.length - 1].timestamp,
    initialSoc: readings[0].soc_kwh,
    finalSoc: readings[readings.length - 1].soc_kwh,
    validationErrors,
  }

  let energyConsumed = 0
  let energyRecovered = 0
  let lastTime = new Date(readings[0].timestamp).getTime() / 1000

  // Process each reading
  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1]
    const curr = readings[i]
    const currTime = new Date(curr.timestamp).getTime() / 1000

    // Check for time gap (missing data)
    const gap = currTime - lastTime
    if (gap > maxGapSeconds) {
      validationErrors.push(`Time gap of ${gap}s exceeds ${maxGapSeconds}s limit`)
    }

    // Integrate power over time (kWh)
    const timeHours = gap / 3600
    const energyDelta = curr.power_kw * timeHours

    if (energyDelta > 0) {
      // Charging (recovering energy)
      energyRecovered += energyDelta
    } else {
      // Discharging (consuming energy)
      energyConsumed += Math.abs(energyDelta)
    }

    lastTime = currTime
  }

  // Verify against SOC change (sanity check)
  const socDelta = Math.abs(session.finalSoc! - session.initialSoc!)
  const calculatedDelta = energyConsumed - energyRecovered

  // Allow 5% tolerance for measurement error
  if (Math.abs(calculatedDelta - socDelta) > 5) {
    validationErrors.push(
      `Calculated energy delta (${calculatedDelta.toFixed(2)} kWh) ` +
        `does not match SOC change (${socDelta.toFixed(2)} kWh)`
    )
  }

  const duration = lastTime - (new Date(readings[0].timestamp).getTime() / 1000)

  return {
    ...session,
    energyConsumed: Math.round(energyConsumed * 100) / 100,
    energyRecovered: Math.round(energyRecovered * 100) / 100,
    netEnergy:
      Math.round((energyRecovered - energyConsumed) * 100) / 100,
    duration,
    isValid: validationErrors.length === 0,
  } as EnergySession
}

/**
 * Separate consumption and regeneration
 * Never combine across different session types
 */
export function separateEnergyFlows(
  readings: EnergyReading[]
): { consumption: number; regeneration: number } {
  let consumption = 0
  let regeneration = 0

  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1]
    const curr = readings[i]

    const timeHours =
      (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) /
      3600000

    const energyDelta = curr.power_kw * timeHours

    if (energyDelta > 0) {
      regeneration += energyDelta
    } else {
      consumption += Math.abs(energyDelta)
    }
  }

  return {
    consumption: Math.round(consumption * 100) / 100,
    regeneration: Math.round(regeneration * 100) / 100,
  }
}

/**
 * Validate energy readings for accuracy
 */
export function validateEnergyReading(reading: EnergyReading): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Check SOC is between 0 and battery capacity
  if (reading.soc_kwh < 0 || reading.soc_kwh > reading.battery_capacity_kwh) {
    errors.push(
      `SOC (${reading.soc_kwh} kWh) out of range ` +
        `[0, ${reading.battery_capacity_kwh}]`
    )
  }

  // Check power magnitude is reasonable (< 250 kW for most cars)
  if (Math.abs(reading.power_kw) > 250) {
    errors.push(
      `Power reading (${reading.power_kw} kW) exceeds typical max (250 kW)`
    )
  }

  // Check charging state consistency
  if (reading.is_charging && reading.power_kw < 0) {
    errors.push(`is_charging=true but power_kw=${reading.power_kw} (negative)`)
  }

  if (!reading.is_charging && reading.power_kw > 0) {
    errors.push(
      `is_charging=false but power_kw=${reading.power_kw} (positive)`
    )
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Format energy for display
 */
export function formatEnergy(kwh: number, options?: { decimals?: number }) {
  const decimals = options?.decimals ?? 2
  return `${kwh.toFixed(decimals)} kWh`
}

export function formatPower(kw: number, options?: { decimals?: number }) {
  const decimals = options?.decimals ?? 1
  return `${kw.toFixed(decimals)} kW`
}

export function formatEfficiency(wh_per_km: number) {
  return `${wh_per_km.toFixed(0)} Wh/km`
}

