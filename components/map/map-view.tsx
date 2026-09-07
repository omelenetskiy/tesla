'use client'

import * as React from 'react'
import * as maplibregl from 'maplibre-gl'
import { cn } from '@/lib/utils'

/**
 * Reusable MapLibre surface (§34).
 *
 * Takes plain coordinates and a route and knows nothing about vehicles or trips, so
 * the same component serves Dashboard, Trips and Charging.
 *
 * It always renders a map. Previously an empty marker list swapped the map out for a
 * placeholder, which meant a car with no telemetry produced no map at all — the
 * caller now supplies a fallback `center` (typically the browser's location) and the
 * map shows that instead.
 */

export type MapPresence = 'driving' | 'parked' | 'charging' | 'sleeping' | 'offline'

export type MapMarker = {
  id: string
  kind: 'vehicle' | 'charger' | 'start' | 'destination' | 'user'
  longitude: number
  latitude: number
  label?: string
  /** Degrees clockwise from north. Only meaningful for the vehicle marker. */
  heading?: number | null
  presence?: MapPresence
  /** Renders the selection halo, so the open card and its marker read as one thing. */
  selected?: boolean
  onSelect?: () => void
}

export type MapViewHandle = {
  recenter: (zoom?: number) => void
  fitRoute: (padding?: number) => void
}

export type MapViewProps = {
  markers?: MapMarker[]
  /** Ordered [longitude, latitude] pairs. */
  route?: Array<[number, number]>
  /** Where to look when there is no vehicle fix — usually the browser location. */
  center?: [number, number] | null
  /** Short line shown over the map when the vehicle itself has no position. */
  note?: string | null
  /** Recentre on the vehicle when it moves. Off on the Trips page. */
  followVehicle?: boolean
  fitRoute?: boolean
  initialZoom?: number
  interactive?: boolean
  className?: string
  /** Overlays rendered inside the map box: legends, buttons, the vehicle card. */
  children?: React.ReactNode
}

/**
 * Basemap.
 *
 * OpenFreeMap's **Bright** style is the default: no API key, no signup, tiles/fonts/
 * sprites all served from one host.
 *
 * It used to be Positron, and Positron is the reason the map read as "almost
 * transparent, nothing on it". That is not a rendering bug — measured from the two
 * style documents, Positron ships **55 layers** against Bright's **119**, on a
 * `rgb(242,243,240)` background with street names in 66% grey. Positron is designed as
 * a *background* for data you overlay, so a small box showing only a vehicle arrow over
 * it is almost empty by construction. Bright draws road casings, building footprints,
 * landuse colour and POI icons, which is what makes a map you can actually read from
 * the driver seat. Positron remains available with `NEXT_PUBLIC_MAP_STYLE_URL`.
 *
 * The previous build hot-linked `tile.openstreetmap.org`, whose tile policy forbids
 * this kind of app traffic. Measured directly: with an application User-Agent OSM
 * returns a 103-byte 1-bit placeholder tile, and with a browser User-Agent it returns
 * a real tile plus `x-blocked: Access denied. See
 * https://operations.osmfoundation.org/policies/tiles/`. Either way the map renders
 * grey, which is why it looked broken.
 */
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'
const ATTRIBUTION = '© OpenStreetMap contributors, © OpenFreeMap'

/**
 * Zoom floor.
 *
 * z13 in a square box half a viewport tall shows ~10 km across: no street names, no
 * buildings, just pale geometry — the "blurry and empty" report.
 *
 * The ceiling on how much closer that can usefully go is set by the basemap, not by us:
 * `https://tiles.openfreemap.org/planet` answers with `maxzoom: 14`, and a request for
 * a z15 tile returns HTTP 200 with **0 bytes** (measured). Above 14 MapLibre overzooms
 * the z14 tile — features and labels still draw, just soft. So z16 is as close as this
 * host gets while remaining legible; anything sharper needs a deeper tile source, not a
 * bigger number here.
 */
const MIN_USEFUL_ZOOM = 16

/**
 * Last-resort local style. Only used if the remote style cannot be fetched — a
 * degraded map with plain OSM raster still beats an empty rectangle, and the
 * `degraded` note tells the operator which one they are looking at.
 */
const fallbackStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    raster: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'raster',
      type: 'raster',
      source: 'raster',
      paint: {
        'raster-saturation': -0.88,
        'raster-contrast': -0.06,
        'raster-brightness-min': 0.86,
        'raster-brightness-max': 0.98,
        'raster-opacity': 0.85,
      },
    },
  ],
}

function configuredStyle(): string | maplibregl.StyleSpecification {
  const override = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
  if (!override) return DEFAULT_STYLE_URL
  if (override.startsWith('{')) {
    try {
      return JSON.parse(override) as maplibregl.StyleSpecification
    } catch {
      return DEFAULT_STYLE_URL
    }
  }
  return override
}

const PRESENCE_COLOR: Record<MapPresence, string> = {
  driving: '#2563eb',
  charging: '#16a34a',
  parked: '#64748b',
  sleeping: '#94a3b8',
  offline: '#cbd5e1',
}

function markerElement(marker: MapMarker): HTMLElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = `map-marker map-marker-${marker.kind}${marker.presence ? ` map-marker-${marker.presence}` : ''}${marker.selected ? ' is-selected' : ''}`
  element.setAttribute('aria-label', marker.label ?? marker.kind)
  if (marker.kind === 'vehicle') {
    const color = PRESENCE_COLOR[marker.presence ?? 'parked']
    element.style.setProperty('--marker-color', color)
    // Direction is carried by the glyph: a navigation arrow rotated to the heading.
    const heading = typeof marker.heading === 'number' && marker.heading > 0 ? marker.heading : 0
    element.innerHTML = `<svg class="map-marker-arrow" viewBox="0 0 24 24" aria-hidden style="transform:rotate(${heading}deg)"><path d="M12 1.6 19.4 21.8 12 17.2 4.6 21.8Z"/></svg>`
  } else if (marker.kind === 'user') {
    element.innerHTML = `<span class="map-marker-you"><span class="map-marker-you-core"></span></span>`
  } else {
    element.innerHTML = `<span class="map-marker-pin"></span>`
  }
  if (marker.onSelect) element.addEventListener('click', marker.onSelect)
  else element.disabled = true
  return element
}

export const MapView = React.forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const { markers = [], route = [], center = null, note = null, followVehicle = true, fitRoute = true, initialZoom = MIN_USEFUL_ZOOM, interactive = true, className, children } = props

  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<maplibregl.Map | null>(null)
  const markerRefs = React.useRef(new Map<string, { marker: maplibregl.Marker; signature: string }>())
  const readyRef = React.useRef(false)
  const parkedRef = React.useRef(false)
  const [ready, setReady] = React.useState(false)
  const [basemapIssue, setBasemapIssue] = React.useState<string | null>(null)

  const vehicle = markers.find((marker) => marker.kind === 'vehicle') ?? null
  const anchor = vehicle ?? markers.find((marker) => marker.kind !== 'user') ?? null
  const hasVehicleFix = Boolean(vehicle)

  /** The point the camera should sit on, kept where the one-shot init effect can reach it. */
  const anchorRef = React.useRef<[number, number] | null>(null)
  React.useEffect(() => {
    anchorRef.current = anchor ? [anchor.longitude, anchor.latitude] : center
  }, [anchor, center])

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const fallback = center ?? null
    const target = anchor ? [anchor.longitude, anchor.latitude] : fallback
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: configuredStyle(),
      center: (target ?? [9.5, 51]) as [number, number],
      // A world view reads as "broken" in a car; start close and let the caller
      // recenter once a fix exists.
      zoom: target ? initialZoom : 4,
      interactive,
      attributionControl: false,
      // The Tesla browser has no hover; drag/zoom must work with one finger.
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }), 'bottom-left')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'bottom-right')
    /**
     * `resize()` preserves the camera *offset*, not the centre — so a container that
     * measured wrong at construction time leaves the marker permanently off-centre
     * even after the box is fixed. Re-assert the centre whenever the box settles,
     * unless the driver has panned away.
     */
    const settleCentre = () => {
      const target = anchorRef.current
      if (!target || parkedRef.current) return
      map.setCenter(target)
    }
    // If the remote style never becomes ready, fall back to the local raster style
    // once. A timeout is the right signal here: a single tile error is routine and
    // must not swap the style out from under a working map.
    const styleDeadline = window.setTimeout(() => {
      if (readyRef.current) return
      try {
        map.setStyle(fallbackStyle)
        readyRef.current = true
        setReady(true)
        // The raster fallback is a different map with different legibility, and its
        // tile host blocks app traffic — so it must never be silent.
        setBasemapIssue('Degraded basemap — the style server did not respond')
      } catch {
        /* container already gone */
      }
    }, 10_000)
    // A blank-looking map has two very different causes — no style, or a style with no
    // tiles — and from the driver seat both just read as "nothing here". Say which.
    let tileErrors = 0
    map.on('error', (event) => {
      if (!readyRef.current) return
      tileErrors += 1
      console.warn('[map] tile error', event?.error?.message ?? String(event))
      if (tileErrors === 4) setBasemapIssue('Basemap tiles are failing — the network is blocking tiles.openfreemap.org')
    })
    // Track a manual pan so following stops fighting the user, and resumes on
    // recenter.
    map.on('dragstart', () => {
      parkedRef.current = true
    })
    map.on('load', () => {
      window.clearTimeout(styleDeadline)
      readyRef.current = true
      setReady(true)
      // Re-measure once the style is in: the canvas is sized at construction, which
      // on a slow first layout can be before the container has its final height.
      map.resize()
      requestAnimationFrame(() => {
        map.resize()
        settleCentre()
      })
    })
    // MapLibre reads the container's size when it is constructed. Inside a CSS grid
    // the element is frequently still measuring at that moment, which produces the
    // classic symptom: a canvas that only fills part of its box. Re-measure on every
    // container resize instead of trusting the initial value.
    let destroyed = false
    const observer = new ResizeObserver(() => {
      if (destroyed) return
      map.resize()
      settleCentre()
    })
    observer.observe(containerRef.current)
    mapRef.current = map
    // Captured for the cleanup: the ref itself may point elsewhere by then.
    const registry = markerRefs.current
    return () => {
      destroyed = true
      window.clearTimeout(styleDeadline)
      observer.disconnect()
      map.remove()
      mapRef.current = null
      readyRef.current = false
      registry.clear()
    }
    // Intentional: the map instance is created exactly once and every later change
    // is applied by the sync effects below. Only the initial view reads props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fitToRoute = React.useCallback((padding = 56) => {
    const map = mapRef.current
    if (!map || route.length < 2) return
    const bounds = route.reduce((acc, point) => acc.extend(point), new maplibregl.LngLatBounds(route[0], route[0]))
    map.fitBounds(bounds, { padding, duration: 500, maxZoom: 16 })
  }, [route])

  React.useImperativeHandle(ref, () => ({
    recenter: (zoom?: number) => {
      const map = mapRef.current
      const target = vehicle ? [vehicle.longitude, vehicle.latitude] : center
      if (!map || !target) return
      parkedRef.current = false
      map.easeTo({ center: target as [number, number], zoom: zoom ?? Math.max(map.getZoom(), MIN_USEFUL_ZOOM), duration: 450 })
    },
    fitRoute: (padding?: number) => fitToRoute(padding),
  }), [vehicle, center, fitToRoute])

  // Route line — one source, updated in place so re-renders do not thrash layers.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const existing = map.getSource('route') as maplibregl.GeoJSONSource | undefined
    const data: GeoJSON.Feature<GeoJSON.LineString> | null = route.length >= 2
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } }
      : null

    if (!existing) {
      if (!data) return
      map.addSource('route', { type: 'geojson', data })
      // Casing first so the stroke reads as one rounded line on a light basemap.
      // MapLibre v6's public layer types do not expose line-join/line-cap.
      const casing: maplibregl.LineLayerSpecification = {
        id: 'route-casing',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.8 },
      }
      const line: maplibregl.LineLayerSpecification = {
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#2563eb', 'line-width': 3.5, 'line-opacity': 0.95 },
      }
      map.addLayer(casing)
      map.addLayer(line)
      return
    }
    if (data) existing.setData(data)
    else {
      for (const layer of ['route-line', 'route-casing']) if (map.getLayer(layer)) map.removeLayer(layer)
      map.removeSource('route')
    }
  }, [route, ready])

  React.useEffect(() => {
    if (ready && fitRoute && route.length >= 2) fitToRoute()
  }, [ready, fitRoute, route, fitToRoute])

  // Markers are keyed by id; only changed ones are rebuilt, so a moving vehicle does
  // not flicker on every poll.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const seen = new Set<string>()
    for (const marker of markers) {
      seen.add(marker.id)
      const signature = `${marker.longitude},${marker.latitude},${marker.presence ?? ''},${marker.heading ?? ''},${marker.label ?? ''},${marker.selected ? '1' : '0'}`
      const cached = markerRefs.current.get(marker.id)
      if (cached?.signature === signature) continue
      if (cached) {
        cached.marker.remove()
        markerRefs.current.delete(marker.id)
      }
      const instance = new maplibregl.Marker({ element: markerElement(marker), anchor: marker.kind === 'vehicle' || marker.kind === 'user' ? 'center' : 'bottom' })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(map)
      markerRefs.current.set(marker.id, { marker: instance, signature })
    }
    for (const [id, cached] of Array.from(markerRefs.current.entries())) {
      if (seen.has(id)) continue
      cached.marker.remove()
      markerRefs.current.delete(id)
    }
  }, [markers, ready])

  /**
   * Move the view when there is no vehicle fix but a fallback location arrives
   * later — geolocation resolves asynchronously, so the map is already mounted by
   * the time it has somewhere useful to look.
   */
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || vehicle || !center || parkedRef.current || route.length >= 2) return
    map.easeTo({ center, zoom: Math.max(map.getZoom(), MIN_USEFUL_ZOOM), duration: 450 })
  }, [center, vehicle, route.length])

  // Follow the vehicle without stealing the user's pan.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !followVehicle || !vehicle || parkedRef.current || route.length >= 2) return
    map.easeTo({ center: [vehicle.longitude, vehicle.latitude], duration: 450 })
  }, [vehicle?.longitude, vehicle?.latitude, followVehicle, route.length, vehicle])

  return (
    /*
      One box, one coordinate space.

      This used to be a bordered box nested inside the caller's bordered box, which
      caused both complaints at once: the canvas filled only the inner box, and
      controls positioned against the outer box sat off the map. The caller now gives
      this element its height via `className` and passes overlays as `children`, so
      the canvas and the controls share the same containing block.
    */
    <div className={cn('relative overflow-hidden rounded-lg border border-line bg-canvas', className)}>
      <div ref={containerRef} className="absolute inset-0" role="img" aria-label="Vehicle map" />
      {children}
      {basemapIssue && (
        <div className="pointer-events-none absolute inset-x-0 top-2.5 flex justify-center px-3">
          <p className="rounded-md border border-warn-line bg-warn-soft px-2 py-1 text-center text-[11px] font-medium text-warn">
            {basemapIssue}
          </p>
        </div>
      )}
      {note && !hasVehicleFix && (
        <div className="pointer-events-none absolute inset-x-0 bottom-9 flex justify-center px-3">
          <p className="max-w-[420px] rounded-lg border border-line bg-surface/95 px-3 py-1.5 text-center text-[12px] leading-4 text-ink-secondary shadow-sm">{note}</p>
        </div>
      )}
    </div>
  )
})
