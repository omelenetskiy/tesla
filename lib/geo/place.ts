/**
 * Reverse geocoding for the Location card.
 *
 * Tesla reports coordinates and nothing else — there is no address field anywhere in
 * `drive_state` — so a card that says "Budapest" instead of "47.4979, 19.0402" has to
 * ask somebody. Photon (komoot's OSM gazetteer) is used because it needs no key and no
 * signup, which is the only class of provider that can be wired into a personal app
 * without a credential the user has to go and obtain.
 *
 * Two rules this obeys:
 *  - **It never invents a place.** No feature, no label: the caller falls back to the
 *    raw coordinates and says so. A confidently wrong city name is worse than none.
 *  - **It is never on the critical path.** The dashboard paints from its own snapshot;
 *    this is a separate, timeout-bounded request whose absence is invisible.
 *
 * Requests are deduplicated through a small in-process cache keyed to a ~1 km grid,
 * because a parked car asks the same question on every open and Photon is a shared
 * public instance.
 */

const PHOTON_REVERSE = 'https://photon.komoot.io/reverse'
const TIMEOUT_MS = 4_000
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_MAX = 200

export type PlaceLabel = {
  city: string | null
  district: string | null
  street: string | null
  postcode: string | null
  country: string | null
  /** Best available human string, most specific first. */
  label: string
}

type PhotonProperties = {
  name?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  county?: string
  state?: string
  district?: string
  locality?: string
  postcode?: string
  country?: string
  type?: string
}

type PhotonResponse = { features?: Array<{ properties?: PhotonProperties }> }

const cache = new Map<string, { at: number; place: PlaceLabel | null }>()

function cacheKey(lat: number, lon: number): string {
  // 0.01° is ~1.1 km of latitude: close enough that a car which did not move asks
  // once, and coarse enough that it does not pin a café to a street corner.
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

function firstString(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (trimmed) return trimmed
  }
  return null
}

/**
 * What counts as "the street" here.
 *
 * Photon answers with the nearest feature of any kind, and at `type: street` that is
 * often a pedestrian lane 200 m away. It is still the most specific honest label, so it
 * is used — but only alongside a city, never instead of one.
 */
function toPlace(properties: PhotonProperties): PlaceLabel {
  const street = properties.type === 'street' || properties.type === 'road' ? firstString(properties.name) : null
  const city = firstString(properties.city, properties.town, properties.village, properties.municipality, properties.county, properties.state)
  const district = firstString(properties.district, properties.locality)
  const label = [street, district, city].filter(Boolean).join(' · ') || (firstString(properties.name, properties.state, properties.country) ?? '')
  return {
    city,
    district,
    street,
    postcode: firstString(properties.postcode),
    country: firstString(properties.country),
    label,
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<PlaceLabel | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null

  const key = cacheKey(lat, lon)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.place

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = `${PHOTON_REVERSE}?lat=${lat}&lon=${lon}&lang=en`
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      // A named UA is the courtesy Photon's operators ask of shared instances.
      headers: { 'User-Agent': 'DriveScope (vehicle status dashboard)' },
    })
    if (!response.ok) return null
    const body = (await response.json()) as PhotonResponse
    const feature = body.features?.[0]?.properties
    const place = feature ? toPlace(feature) : null
    remember(key, place)
    return place && place.label ? place : null
  } catch {
    // A failed lookup is not worth a second attempt on the same screen, and caching the
    // miss stops a flapping gazetteer from being re-asked on every render.
    remember(key, null)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function remember(key: string, place: PlaceLabel | null) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { at: Date.now(), place })
}
