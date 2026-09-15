import type { Trip } from '@/lib/tesla/models'

type UiLocation = { lat: number; lng: number; name: string }

export function isValidRoutePoint(point: unknown): point is [number, number] {
  if (!Array.isArray(point) || point.length < 2) return false
  const lng = Number(point[0])
  const lat = Number(point[1])
  return Number.isFinite(lng) && Number.isFinite(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function toUiLocation(latitude: number, longitude: number, name: string): UiLocation | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { lat: latitude, lng: longitude, name }
}

export function getRoutePoints(route: Array<[number, number]>): Array<[number, number]> {
  return route.filter(isValidRoutePoint)
}

export function resolveTripLocations(trip: Pick<Trip, 'startLocation' | 'endLocation' | 'route'>): {
  startLocation: UiLocation | null
  endLocation: UiLocation | null
  routePoints: Array<[number, number]>
} {
  const routePoints = getRoutePoints(trip.route)

  const inferredStart = routePoints[0] ? toUiLocation(routePoints[0][1], routePoints[0][0], 'Start point (inferred)') : null
  const inferredEnd = routePoints[routePoints.length - 1]
    ? toUiLocation(routePoints[routePoints.length - 1][1], routePoints[routePoints.length - 1][0], 'End point (inferred)')
    : null

  const directStart = trip.startLocation
    ? toUiLocation(trip.startLocation.latitude, trip.startLocation.longitude, 'Start point')
    : null
  const directEnd = trip.endLocation
    ? toUiLocation(trip.endLocation.latitude, trip.endLocation.longitude, 'End point')
    : null

  return {
    startLocation: directStart ?? inferredStart,
    endLocation: directEnd ?? inferredEnd,
    routePoints,
  }
}

export function buildRouteForSamples(routePoints: Array<[number, number]>, startLocation: UiLocation | null, endLocation: UiLocation | null): Array<[number, number]> {
  if (routePoints.length > 0) return routePoints
  if (!startLocation || !endLocation) return []
  return [
    [startLocation.lng, startLocation.lat],
    [endLocation.lng, endLocation.lat],
  ]
}

export type { UiLocation }

