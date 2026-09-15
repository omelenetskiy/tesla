import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export interface VehicleStatusCache {
  vehicleId: string
  batteryLevel: number
  latitude: number
  longitude: number
  isSleeping: boolean
  lastUpdatedAt: string
  isLive: boolean
}

/**
 * Cache-first vehicle status reading
 * Never wakes the vehicle automatically
 */
export async function readVehicleStatus(
  vehicleId: string
): Promise<VehicleStatusCache> {
  // Step 1: Read from cache (DB snapshot) first
  const cached = await getVehicleSnapshot(vehicleId)

  if (cached) {
    return {
      ...cached,
      isLive: false, // Mark as cached, not live
    }
  }

  // Step 2: Only if no cache, try live API (won't wake vehicle)
  try {
    const live = await getVehicleFromAPI(vehicleId)
    if (live) {
      return {
        ...live,
        isLive: true,
      }
    }
  } catch (error) {
    console.error('Live API fallback triggered:', error)
  }

  // Step 3: Fallback to last known state if live API fails or returns no data
  const fallback = await getLastKnownState(vehicleId)
  return {
    ...fallback,
    isLive: false,
  }
}

/**
 * Get latest snapshot from database (never wakes vehicle)
 */
async function getVehicleSnapshot(
  vehicleId: string
): Promise<Omit<VehicleStatusCache, 'isLive'> | null> {
  try {
    const { data, error } = await supabase
      .from('vehicle_states')
      .select(
        `
        id,
        battery_level,
        latitude,
        longitude,
        is_sleeping,
        created_at
      `
      )
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null

    return {
      vehicleId,
      batteryLevel: data.battery_level || 0,
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
      isSleeping: data.is_sleeping || false,
      lastUpdatedAt: data.created_at,
    }
  } catch (error) {
    console.error('Cache read error:', error)
    return null
  }
}

/**
 * Get vehicle data from API (no wake-up calls)
 */
async function getVehicleFromAPI(
  vehicleId: string
): Promise<Omit<VehicleStatusCache, 'isLive'> | null> {
  try {
    // This would call actual Tesla Fleet API
    // It returns cached data without waking the vehicle
    // Implementation depends on Fleet API specifics
    return null // Placeholder
  } catch (error) {
    console.error('API read error:', error)
    return null
  }
}

/**
 * Get absolute last known state
 */
async function getLastKnownState(
  vehicleId: string
): Promise<Omit<VehicleStatusCache, 'isLive'>> {
  try {
    const { data } = await supabase
      .from('vehicle_states')
      .select('battery_level, latitude, longitude, is_sleeping, created_at')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return {
      vehicleId,
      batteryLevel: data?.battery_level || 0,
      latitude: data?.latitude || 0,
      longitude: data?.longitude || 0,
      isSleeping: true, // Assume sleeping if no recent data
      lastUpdatedAt: data?.created_at || new Date().toISOString(),
    }
  } catch (error) {
    return {
      vehicleId,
      batteryLevel: 0,
      latitude: 0,
      longitude: 0,
      isSleeping: true,
      lastUpdatedAt: new Date().toISOString(),
    }
  }
}

/**
 * Format vehicle status for UI
 */
export function formatVehicleStatus(status: VehicleStatusCache) {
  return {
    batteryPercent: Math.round(status.batteryLevel),
    location: {
      lat: status.latitude,
      lng: status.longitude,
    },
    state: status.isSleeping ? 'Sleeping' : 'Awake',
    lastSeen: new Date(status.lastUpdatedAt).toLocaleString(),
    isLive: status.isLive,
    isCached: !status.isLive,
  }
}

/**
 * Check if vehicle needs wake-up (explicit user confirmation required)
 */
export function shouldShowWakeUpPrompt(status: VehicleStatusCache): boolean {
  return status.isSleeping && !status.isLive
}

