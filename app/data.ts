export type VehicleState = 'Driving' | 'Parked' | 'Charging' | 'Offline'
export type Freshness = 'LIVE' | 'RECENT' | 'STALE' | 'OFFLINE'

export type Vehicle = {
  id: string
  name: string
  model: string
  color: string
  vin?: string
  state: VehicleState
  battery: number
  range: number
  speed: number
  location: string | null
  coordinates: [number, number] | null
  odometer: number
  chargingState: string
  energyAdded: number | null
  chargePower: number | null
  timeToFullCharge: number | null
  climate: string
  lockState: string
  connectivity: string
  software: string
  lastUpdated: string
  freshness: Freshness
  health: 'Healthy' | 'Attention' | 'Critical'
  healthNote: string
}
