/**
 * Statistics and analytics utilities for vehicle telemetry
 */

export interface TripStats {
  totalDistance: number
  totalTrips: number
  avgDistance: number
  avgEfficiency: number
  maxSpeed: number
  totalTime: number // in minutes
}

export interface ChargingStats {
  totalSessions: number
  totalEnergyAdded: number
  avgSession: number // time in minutes
  avgEnergy: number
  costTotal: number
}

export interface BatteryStats {
  currentSOC: number
  maxSOC: number
  minSOC: number
  avgSOC: number
  degradation: number // percentage
}

export interface TripStatInput {
  distance?: number
  efficiency?: number
  maxSpeed?: number
  startTime?: string
  endTime?: string
}

export interface ChargingStatInput {
  energyAdded?: number
  cost?: number
  startTime?: string
  endTime?: string
}

/**
 * Calculate trip statistics for a date range
 */
export function calculateTripStats(trips: TripStatInput[]): TripStats {
  if (trips.length === 0) {
    return {
      totalDistance: 0,
      totalTrips: 0,
      avgDistance: 0,
      avgEfficiency: 0,
      maxSpeed: 0,
      totalTime: 0,
    }
  }

  const totalDistance = trips.reduce((sum, t) => sum + (t.distance ?? 0), 0)
  const totalTrips = trips.length
  const avgDistance = totalDistance / totalTrips
  const avgEfficiency =
    trips.length > 0 ? trips.reduce((sum, t) => sum + (t.efficiency ?? 0), 0) / trips.length : 0
  const maxSpeed = Math.max(...trips.map((t) => t.maxSpeed ?? 0))
  const totalTime = trips.reduce((sum, t) => {
    const start = t.startTime ? new Date(t.startTime).getTime() : Number.NaN
    const end = t.endTime ? new Date(t.endTime).getTime() : Number.NaN
    if (Number.isNaN(start) || Number.isNaN(end)) return sum
    return sum + (end - start) / 60000
  }, 0)

  return {
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalTrips,
    avgDistance: Math.round(avgDistance * 10) / 10,
    avgEfficiency: Math.round(avgEfficiency),
    maxSpeed: Math.round(maxSpeed),
    totalTime: Math.round(totalTime),
  }
}

/**
 * Calculate charging statistics
 */
export function calculateChargingStats(sessions: ChargingStatInput[]): ChargingStats {
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalEnergyAdded: 0,
      avgSession: 0,
      avgEnergy: 0,
      costTotal: 0,
    }
  }

  const totalEnergyAdded = sessions.reduce((sum, s) => sum + (s.energyAdded ?? 0), 0)
  const avgEnergy = totalEnergyAdded / sessions.length
  const costTotal = sessions.reduce((sum, s) => sum + (s.cost ?? 0), 0)
  const avgSession =
    sessions.reduce((sum, s) => {
      const start = s.startTime ? new Date(s.startTime).getTime() : Number.NaN
      const end = s.endTime ? new Date(s.endTime).getTime() : Number.NaN
      if (Number.isNaN(start) || Number.isNaN(end)) return sum
      return sum + (end - start) / 60000
    }, 0) / sessions.length

  return {
    totalSessions: sessions.length,
    totalEnergyAdded: Math.round(totalEnergyAdded * 10) / 10,
    avgSession: Math.round(avgSession),
    avgEnergy: Math.round(avgEnergy * 10) / 10,
    costTotal: Math.round(costTotal * 100) / 100,
  }
}

/**
 * Estimate range based on battery level and efficiency
 */
export function estimateRange(batteryLevel: number, avgEfficiency: number): number {
  const capacity = 75 // kWh, assumes Model Y Long Range
  const chargekWh = (batteryLevel / 100) * capacity
  const rangeKm = (chargekWh * 1000) / avgEfficiency // efficiency in Wh/km
  return Math.round(rangeKm)
}

/**
 * Calculate energy consumption
 */
export function calculateEnergyConsumption(distance: number, efficiency: number): number {
  return Math.round((distance * efficiency) / 1000 * 10) / 10 // in kWh
}

/**
 * Group data by date
 */
export function groupByDate<T extends { timestamp?: string; startTime?: string; date?: string }>(
  items: T[],
  dateKey: 'timestamp' | 'startTime' | 'date' = 'startTime'
): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      const dateStr = item[dateKey]
      if (!dateStr) return acc
      const date = new Date(dateStr).toLocaleDateString()
      if (!acc[date]) acc[date] = []
      acc[date].push(item)
      return acc
    },
    {} as Record<string, T[]>
  )
}

/**
 * Calculate trends
 */
export function calculateTrend(current: number, previous: number): {
  direction: 'up' | 'down' | 'stable'
  percentage: number
} {
  if (previous === 0) return { direction: 'stable', percentage: 0 }
  const change = ((current - previous) / previous) * 100
  const direction = change > 2 ? 'up' : change < -2 ? 'down' : 'stable'
  return { direction, percentage: Math.round(Math.abs(change)) }
}

/**
 * Format duration in minutes to readable string
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
