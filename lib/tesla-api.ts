import type { Vehicle, VehicleState, Freshness } from '../app/data'

export type TeslaVehicle = {
  id: number
  vehicle_id?: number
  display_name?: string
  car_type?: string
  state?: string
  charge_state?: { battery_level?: number; battery_range?: number; charging_state?: string }
  drive_state?: { speed?: number | null; latitude?: number; longitude?: number; shift_state?: string | null }
  vehicle_state?: { odometer?: number; software_version?: string }
  climate_state?: { inside_temp?: number | null }
}

type TeslaResponse<T> = { response?: T }

const baseUrl = (process.env.TESLA_API_BASE_URL || 'https://owner-api.teslamotors.com').replace(/\/$/, '')
function getFreshness(state: VehicleState, updatedAt: Date): Freshness {
  const age = (Date.now() - updatedAt.getTime()) / 1000
  if (state === 'Offline' || age > 900) return 'OFFLINE'
  if (age > 300) return 'STALE'
  if (age > 30) return 'RECENT'
  return 'LIVE'
}

function normalizeVehicle(source: TeslaVehicle): Vehicle {
  const updatedAt = new Date()
  const charge = source.charge_state ?? {}
  const drive = source.drive_state ?? {}
  const state: VehicleState = source.state === 'online'
    ? charge.charging_state === 'Charging' ? 'Charging' : drive.shift_state && drive.shift_state !== 'P' ? 'Driving' : 'Parked'
    : 'Offline'
  const latitude = drive.latitude ?? 45.5162
  const longitude = drive.longitude ?? -122.6694
  return {
    id: String(source.vehicle_id ?? source.id),
    name: source.display_name || 'My Tesla',
    model: source.car_type || 'Tesla vehicle',
    color: '#2f80ed',
    state,
    battery: charge.battery_level ?? 0,
    range: Math.round(charge.battery_range ?? 0),
    speed: Math.round(Math.abs(drive.speed ?? 0) * 0.621371),
    location: 'Latest known location',
    coordinates: [longitude, latitude],
    odometer: Math.round(source.vehicle_state?.odometer ?? 0),
    chargingState: charge.charging_state || 'Not charging',
    climate: source.climate_state?.inside_temp == null ? 'Off' : `${Math.round(source.climate_state.inside_temp)}°C`,
    lockState: 'Available from vehicle data',
    connectivity: source.state === 'online' ? 'Connected' : 'No signal',
    software: source.vehicle_state?.software_version || 'Unavailable',
    lastUpdated: 'just now',
    freshness: getFreshness(state, updatedAt),
    health: 'Healthy',
    healthNote: 'Live snapshot received from Tesla API',
  }
}

async function teslaFetch<T>(path: string, accessToken: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Tesla API request timed out')
    throw error
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Tesla API credentials were rejected')
    if (response.status === 429) throw new Error('Tesla API rate limit reached')
    throw new Error(`Tesla API returned ${response.status}`)
  }
  let payload: TeslaResponse<T>
  try {
    payload = await response.json() as TeslaResponse<T>
  } catch {
    throw new Error('Tesla API returned malformed JSON')
  }
  if (!payload.response) throw new Error('Tesla API response did not include response data')
  return payload.response
}

export async function getTeslaVehicles(accessToken: string) {
  return teslaFetch<TeslaVehicle[]>('/api/1/vehicles', accessToken)
}

export async function getTeslaVehicle(accessToken: string, vehicleId: string, includeDetails = true): Promise<Vehicle> {
  const vehicles = await getTeslaVehicles(accessToken)
  const source = vehicles.find((vehicle) => String(vehicle.id) === vehicleId || String(vehicle.vehicle_id) === vehicleId)
  if (!source) throw new Error('Configured Tesla vehicle was not found')
  const detail = includeDetails ? await teslaFetch<TeslaVehicle>(`/api/1/vehicles/${source.id}/vehicle_data`, accessToken) : {}
  return normalizeVehicle({ ...source, ...detail })
}


