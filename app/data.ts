export type VehicleState = 'Driving' | 'Parked' | 'Charging' | 'Offline'
export type Freshness = 'LIVE' | 'RECENT' | 'STALE' | 'OFFLINE'

export type Vehicle = {
  id: string
  name: string
  model: string
  color: string
  state: VehicleState
  battery: number
  range: number
  speed: number
  location: string
  coordinates: [number, number]
  odometer: number
  chargingState: string
  climate: string
  lockState: string
  connectivity: string
  software: string
  lastUpdated: string
  freshness: Freshness
  health: 'Healthy' | 'Attention' | 'Critical'
  healthNote: string
}

export type Trip = {
  id: string
  vehicleId: string
  date: string
  startTime: string
  endTime: string
  start: string
  destination: string
  duration: string
  distance: number
  batteryStart: number
  batteryEnd: number
  energy: number
  averageSpeed: number
  efficiency: number
  route: [number, number][]
}

export type ChargingSession = {
  id: string
  vehicleId: string
  location: string
  chargerType: string
  date: string
  start: string
  end: string
  duration: string
  batteryBefore: number
  batteryAfter: number
  energy: number
  power: number
  cost: number
}

export type Alert = {
  id: string
  vehicleId: string
  severity: 'Critical' | 'Warning' | 'Information'
  title: string
  detail: string
  time: string
  status: 'Unread' | 'Acknowledged' | 'Resolved'
}

export const vehicles: Vehicle[] = [
  { id: 'v1', name: 'Juniper', model: 'Model Y Long Range', color: '#2f80ed', state: 'Driving', battery: 81, range: 264, speed: 42, location: 'Hawthorne Bridge', coordinates: [-122.6694, 45.5162], odometer: 28410, chargingState: 'Not charging', climate: '22°C', lockState: 'Locked', connectivity: 'Excellent', software: '2026.20.6', lastUpdated: '8 sec ago', freshness: 'LIVE', health: 'Healthy', healthNote: 'All systems reporting normally' },
]

export const trips: Trip[] = [
  { id: 't1', vehicleId: 'v1', date: 'Today', startTime: '08:42', endTime: '09:18', start: 'Alberta Arts', destination: 'Hawthorne Bridge', duration: '36 min', distance: 14.8, batteryStart: 86, batteryEnd: 81, energy: 4.9, averageSpeed: 25, efficiency: 331, route: [[-122.646, 45.559], [-122.657, 45.548], [-122.669, 45.516]] },
  { id: 't3', vehicleId: 'v1', date: 'Yesterday', startTime: '07:54', endTime: '08:27', start: 'Hawthorne', destination: 'Vancouver Waterfront', duration: '33 min', distance: 17.4, batteryStart: 92, batteryEnd: 86, energy: 6.1, averageSpeed: 32, efficiency: 351, route: [[-122.60, 45.51], [-122.64, 45.53], [-122.67, 45.63]] },
  { id: 't4', vehicleId: 'v1', date: 'Sep 04', startTime: '18:12', endTime: '18:48', start: 'Sellwood', destination: 'Rose Quarter', duration: '36 min', distance: 12.6, batteryStart: 51, batteryEnd: 46, energy: 5.7, averageSpeed: 21, efficiency: 452, route: [[-122.65, 45.46], [-122.66, 45.50], [-122.666, 45.532]] },
]

export const chargingSessions: ChargingSession[] = [
  { id: 'c1', vehicleId: 'v1', location: 'Rose Quarter Garage', chargerType: 'Destination', date: 'Today', start: '06:18', end: '07:46', duration: '1h 28m', batteryBefore: 22, batteryAfter: 46, energy: 20.8, power: 11.4, cost: 4.16 },
  { id: 'c2', vehicleId: 'v1', location: 'Home charger', chargerType: 'Home AC', date: 'Sep 04', start: '22:08', end: '05:42', duration: '7h 34m', batteryBefore: 34, batteryAfter: 92, energy: 49.3, power: 7.1, cost: 8.87 },
  { id: 'c3', vehicleId: 'v1', location: 'Bridgeport Supercharger', chargerType: 'Supercharger', date: 'Sep 02', start: '14:22', end: '14:57', duration: '35m', batteryBefore: 18, batteryAfter: 63, energy: 38.2, power: 65.5, cost: 13.37 },
  { id: 'c4', vehicleId: 'v1', location: 'Home charger', chargerType: 'Home AC', date: 'Aug 29', start: '21:44', end: '04:51', duration: '7h 07m', batteryBefore: 28, batteryAfter: 88, energy: 51.0, power: 7.2, cost: 9.18 },
]

export const alerts: Alert[] = [
  { id: 'a1', vehicleId: 'v1', severity: 'Warning', title: 'Vehicle offline', detail: 'No telemetry has arrived for 41 minutes.', time: '41 min ago', status: 'Unread' },
  { id: 'a2', vehicleId: 'v1', severity: 'Information', title: 'Charging session complete', detail: 'Juniper added 20.8 kWh at Rose Quarter Garage.', time: '1h ago', status: 'Resolved' },
  { id: 'a3', vehicleId: 'v1', severity: 'Information', title: 'Software update available', detail: 'Version 2026.20.6 is ready to install.', time: 'Yesterday', status: 'Acknowledged' },
  { id: 'a4', vehicleId: 'v1', severity: 'Warning', title: 'Tire pressure check', detail: 'Front right tire is 3 PSI below target.', time: 'Sep 04', status: 'Unread' },
]

export const chartData = [
  { day: 'Sep 01', energy: 18.2, efficiency: 328 }, { day: 'Sep 02', energy: 24.7, efficiency: 351 }, { day: 'Sep 03', energy: 13.4, efficiency: 305 }, { day: 'Sep 04', energy: 29.1, efficiency: 376 }, { day: 'Sep 05', energy: 21.6, efficiency: 341 }, { day: 'Sep 06', energy: 31.4, efficiency: 389 }, { day: 'Sep 07', energy: 11.7, efficiency: 318 },
]

export function freshnessLabel(freshness: Freshness) {
  return freshness === 'LIVE' ? 'Live' : freshness === 'RECENT' ? 'Recent' : freshness === 'STALE' ? 'Stale' : 'Offline'
}

export function vehicleById(id: string) {
  return vehicles.find((vehicle) => vehicle.id === id) ?? vehicles[0]
}
