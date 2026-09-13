'use client'

import * as React from 'react'
import * as maplibregl from 'maplibre-gl'
import { BASEMAP_ATTRIBUTION, buildBasemapStyle, SOURCE_MAX_ZOOM } from '@/lib/map/basemap'
import { useTheme } from '@/lib/hooks/use-theme'
import { cn } from '@/lib/utils'

/**
 * Where MapLibre's tile worker actually lives.
 *
 * Left alone, MapLibre derives the worker URL from `import.meta.url` of its own module —
 * which a bundler rewrites to the emitted chunk's path, where no worker file was ever
 * written. The browser fetches a chunk-directory entry that does not exist, gets the dev
 * server's HTML 404 page back, and refuses the module script on MIME grounds. The worker
 * never starts, and nothing about that fails loudly: tile and glyph requests are issued
 * from *inside* the worker, so the map paints its `background` layer — one flat colour —
 * and looks like a broken basemap rather than a missing script. v6 has no main-thread
 * fallback to fall back to.
 *
 * So the worker is vendored into `public/maplibre/` (see scripts/build-assets.mjs) and
 * named here. It has to be set before any map is constructed: the worker spawns on the
 * first one.
 */
export const MAP_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs'
maplibregl.setWorkerUrl(MAP_WORKER_URL)

/**
 * A read-only map surface.
 *
 * Written from scratch over `lib/map/basemap.ts`, replacing a component that had grown a
 * style watchdog, an auto-degrading fallback, an imperative handle and overlay slots —
 * four escape hatches for failures that were all consequences of fetching the style from
 * a third-party host. Building the style locally removes the failure mode, so the
 * recovery machinery goes with it.
 *
 * What it deliberately does not have:
 *  - **no controls.** No zoom buttons, no compass, no scale, no fullscreen. This screen
 *    answers "where is the car"; it does not navigate. Attribution stays because the
 *    tile licence requires it, not because it is a control.
 *  - **no wheel zoom.** `scrollZoom` off: a map that swallows the wheel makes the page
 *    around it feel broken, and in the car there is no wheel to begin with. Drag and
 *    pinch still work, so a driver who wants to look around can.
 *  - **no map at all when there is nothing to show.** With no vehicle fix and no
 *    fallback centre it renders the caller's placeholder instead of instantiating
 *    MapLibre. A central-Budapest z14 tile is 380 KB over the car's own cellular
 *    connection; spending that to draw an empty world view is a bug, not a fallback.
 */

export type MapPresence = 'driving' | 'parked' | 'charging' | 'sleeping' | 'offline'

export type MapMarker = {
  id: string
  kind: 'vehicle' | 'charger' | 'start' | 'destination' | 'user'
  longitude: number
  latitude: number
  label?: string
  /** Degrees clockwise from north. Vehicle markers only. */
  heading?: number | null
  presence?: MapPresence
}

export type MapPoint = { longitude: number; latitude: number }

export type VehicleMapProps = {
  /** Where the camera sits when there is no vehicle fix — usually the browser's location. */
  center?: MapPoint | null
  markers?: MapMarker[]
  /** Ordered [longitude, latitude] pairs — trip routes only. */
  route?: Array<[number, number]>
  /**
   * Display zoom. 15 rather than the old 16: the source tops out at z14, so 15 and 16
   * both overzoom and render identically, while 15 keeps a third more of the
   * surroundings in frame. Below ~13 a city block dissolves into landuse tint.
   */
  zoom?: number
  /** Re-centre when the vehicle moves. Superseded by a fitted route and by a manual pan. */
  follow?: boolean
  /** Fit the camera to `route` when it arrives or changes. */
  fitRoute?: boolean
  /** Shown instead of a map when there is no position to draw. */
  placeholder?: React.ReactNode
  className?: string
  ariaLabel?: string
}

const PRESENCE_COLOR: Record<MapPresence, string> = {
  driving: '#2563eb',
  charging: '#16a34a',
  parked: '#64748b',
  sleeping: '#94a3b8',
  offline: '#cbd5e1',
}

function markerElement(marker: MapMarker): HTMLElement {
  const element = document.createElement('div')
  element.className = `map-marker map-marker-${marker.kind}${marker.presence ? ` map-marker-${marker.presence}` : ''}`
  element.setAttribute('aria-label', marker.label ?? marker.kind)
  if (marker.kind === 'vehicle') {
    element.style.setProperty('--marker-color', PRESENCE_COLOR[marker.presence ?? 'parked'])
    const heading = typeof marker.heading === 'number' && marker.heading > 0 ? marker.heading : 0
    element.innerHTML =
      `<span class="map-marker-halo"></span>` +
      `<svg class="map-marker-arrow" viewBox="0 0 24 24" aria-hidden style="transform:rotate(${heading}deg)"><path d="M12 1.6 19.4 21.8 12 17.2 4.6 21.8Z"/></svg>`
  } else if (marker.kind === 'user') {
    element.innerHTML = `<span class="map-marker-you"></span>`
  } else {
    element.innerHTML = `<span class="map-marker-pin"></span>`
  }
  return element
}

function signatureOf(marker: MapMarker): string {
  return `${marker.longitude},${marker.latitude},${marker.presence ?? ''},${marker.heading ?? ''},${marker.label ?? ''}`
}

function isFinitePoint(point: [number, number] | undefined): boolean {
  return Boolean(point && Number.isFinite(point[0]) && Number.isFinite(point[1]))
}

/** The first configured value wins; `undefined` means "fall back to the built-in style". */
function firstConfigured(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

/**
 * The basemap style for a theme.
 *
 * `NEXT_PUBLIC_MAP_STYLE_URL_LIGHT` / `_DARK` pick a hosted style per theme — the pair
 * that ships in `.env` is OpenFreeMap's positron for light and fiord for dark. A single
 * `NEXT_PUBLIC_MAP_STYLE_URL` still works and applies to both themes. Each accepts a style
 * URL or inlined style JSON; empty means the style this app builds itself
 * (`lib/map/basemap.ts`), which needs no style request and no sprite.
 *
 * A hosted style is not free: positron is 25 KB of JSON on the critical path of a cold
 * open and drags in a 77 KB sprite for POI icons, which the built-in style has none of.
 * That is the trade the two variables above opt into deliberately.
 *
 * Read inside a function rather than at module scope, and with the full literal key:
 * a `NEXT_PUBLIC_` value is inlined at build time, and `process.env[name]` would not be.
 */
function styleFor(mode: 'light' | 'dark'): maplibregl.StyleSpecification | string {
  const override = firstConfigured([
    mode === 'dark' ? process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK : process.env.NEXT_PUBLIC_MAP_STYLE_URL_LIGHT,
    process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  ])
  if (!override) return buildBasemapStyle(mode)
  if (override.startsWith('{')) {
    try {
      return JSON.parse(override) as maplibregl.StyleSpecification
    } catch {
      return buildBasemapStyle(mode)
    }
  }
  return override
}

export function VehicleMap(props: VehicleMapProps) {
  const { center = null, markers = [], route = [], zoom = 15, follow = true, fitRoute = true, placeholder = null, className, ariaLabel = 'Vehicle map' } = props
  const { resolved } = useTheme()

  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<maplibregl.Map | null>(null)
  const markersRef = React.useRef(new Map<string, { marker: maplibregl.Marker; signature: string }>())
  /** Set when the driver pans away; a re-centre or a new route clears it. */
  const parkedRef = React.useRef(false)
  /** Camera target, kept in a ref so the one-shot init callback can read the latest one. */
  const targetRef = React.useRef<[number, number] | null>(null)
  /** The basemap mode the live map was built with — see the theme effect for why that matters. */
  const modeRef = React.useRef<'light' | 'dark' | null>(null)

  const [failed, setFailed] = React.useState(false)
  /** Bumped by the retry control; the init effect keys off it and rebuilds the map. */
  const [attempt, setAttempt] = React.useState(0)
  /** Style + first tiles in. Only layer edits wait for it; DOM markers do not. */
  const [styleReady, setStyleReady] = React.useState(false)

  const vehicle = markers.find((marker) => marker.kind === 'vehicle') ?? null
  // The camera sits on the vehicle if there is one, otherwise on the first real feature
  // (a trip's start/destination), and only then on the caller's fallback centre. A
  // `user` marker never anchors the view: it is the browser's location, shown only while
  // there is nothing of the vehicle's to look at.
  const anchor = vehicle ?? markers.find((marker) => marker.kind !== 'user') ?? center
  const routeCoords = React.useMemo<Array<[number, number]>>(() => route.filter(isFinitePoint), [route])
  const hasRoute = routeCoords.length >= 2

  const focusLon = anchor?.longitude ?? null
  const focusLat = anchor?.latitude ?? null

  // Declared before the init effect so the ref is populated by the time it runs, and
  // without assigning during render, which React Compiler rejects.
  React.useEffect(() => {
    targetRef.current = focusLon !== null && focusLat !== null ? [focusLon, focusLat] : null
  }, [focusLon, focusLat])

  React.useEffect(() => {
    const container = containerRef.current
    const target = targetRef.current
    if (!container || !target) return

    const map = new maplibregl.Map({
      container,
      style: styleFor(resolved),
      center: target,
      zoom,
      attributionControl: false,
      // The Tesla browser has no hover and no wheel; one-finger drag and pinch stay on.
      scrollZoom: false,
      doubleClickZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      boxZoom: false,
      touchPitch: false,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: BASEMAP_ATTRIBUTION }), 'bottom-right')
    mapRef.current = map
    modeRef.current = resolved
    setStyleReady(false)

    /**
     * `resize()` preserves the camera *offset*, not the centre. A container that measured
     * wrong at construction time therefore keeps its marker off-centre forever, which is
     * why every re-measure re-asserts the target instead of trusting the camera.
     */
    const settle = () => {
      const next = targetRef.current
      if (!next || parkedRef.current) return
      map.setCenter(next)
    }

    // MapLibre reads the container's size when constructed. Inside a CSS grid the element
    // is frequently still measuring at that moment — a canvas that fills only part of its
    // box is the classic result. Re-measure on every container resize.
    let torn = false
    const observer = new ResizeObserver(() => {
      if (torn) return
      map.resize()
      settle()
    })
    observer.observe(container)

    // A style that never arrives and a tile host that never answer look identical from the
    // driver's seat, so say which one failed and offer a retry. Only errors before the
    // first frame count: afterwards a single failing tile is a network blip, and replacing
    // a working map with an error card would be worse than the blip.
    let loaded = false
    let earlyErrors = 0
    const onError = (event: maplibregl.ErrorEvent) => {
      if (loaded) return
      earlyErrors += 1
      console.warn('[map] basemap load failed', event?.error?.message ?? String(event))
      if (earlyErrors >= 3) setFailed(true)
    }
    const onLoad = () => {
      loaded = true
      setStyleReady(true)
      map.resize()
      requestAnimationFrame(() => {
        if (torn) return
        map.resize()
        settle()
      })
    }
    map.on('error', onError)
    map.on('load', onLoad)
    map.on('dragstart', () => {
      parkedRef.current = true
    })

    // Captured for the cleanup: by then the ref itself may point at a different
    // registry, from a map that was rebuilt underneath this one.
    const registry = markersRef.current

    return () => {
      torn = true
      observer.disconnect()
      map.off('error', onError)
      map.off('load', onLoad)
      map.remove()
      mapRef.current = null
      registry.forEach((entry) => entry.marker.remove())
      registry.clear()
    }
    // `resolved` and `zoom` are read only to build the initial view: a theme change is
    // applied by the setStyle effect below, which must not tear the map down. `failed` is
    // deliberately not a dependency — flipping it must not rebuild the map underneath the
    // error card. `attempt` is the only way back in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  // Theme swap: re-style in place. DOM markers are not part of the style, so they survive;
  // the tiles are unchanged and already cached (OpenFreeMap sends `max-age=315360000`).
  //
  // Only an actual change, though. This effect also runs on mount, where `resolved` is by
  // definition the mode the map was just constructed with — and `setStyle` with a fresh
  // object cannot be diffed against a style that is still loading, so MapLibre logs
  // "Unable to perform style diff: Style is not done loading" and rebuilds the style from
  // scratch, throwing away the source that was mid-handshake with its TileJSON. The result
  // is a map that paints its background layer and never asks for a tile.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || modeRef.current === resolved) return
    modeRef.current = resolved
    map.setStyle(styleFor(resolved))
    // The new style needs its own layer pass before route layers can be re-added.
    setStyleReady(false)
    const onLoaded = () => setStyleReady(true)
    map.once('load', onLoaded)
    return () => {
      map.off('load', onLoaded)
    }
  }, [resolved])

  // Route line — one source, updated in place so a re-render does not thrash layers.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReady) return
    const existing = map.getSource('route') as maplibregl.GeoJSONSource | undefined
    const data: GeoJSON.Feature<GeoJSON.LineString> | null = hasRoute
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoords } }
      : null

    if (!existing) {
      if (!data) return
      map.addSource('route', { type: 'geojson', data })
      // Casing under stroke keeps the line readable over both basemap modes.
      const casingColor = resolved === 'dark' ? '#0b0e12' : '#ffffff'
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': casingColor, 'line-width': 7, 'line-opacity': 0.85 } } as maplibregl.LineLayerSpecification)
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 3.5, 'line-opacity': 0.95 } } as maplibregl.LineLayerSpecification)
      return
    }
    if (data) existing.setData(data)
    else {
      for (const id of ['route-line', 'route-casing']) if (map.getLayer(id)) map.removeLayer(id)
      map.removeSource('route')
    }
  }, [routeCoords, hasRoute, resolved, styleReady])

  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !fitRoute || !hasRoute) return
    const first = routeCoords[0]
    const bounds = routeCoords.reduce((acc, point) => acc.extend(point), new maplibregl.LngLatBounds(first, first))
    // Past the source's native ceiling, fitting only overzooms one tile.
    map.fitBounds(bounds, { padding: 56, duration: 500, maxZoom: SOURCE_MAX_ZOOM })
    parkedRef.current = true
  }, [routeCoords, hasRoute, fitRoute, styleReady])

  // Markers keyed by id; only changed ones are rebuilt, so a moving car does not flicker.
  // DOM overlays, so they go on immediately — no waiting for tiles.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set<string>()
    for (const marker of markers) {
      seen.add(marker.id)
      const signature = signatureOf(marker)
      const cached = markersRef.current.get(marker.id)
      if (cached?.signature === signature) continue
      cached?.marker.remove()
      markersRef.current.set(marker.id, {
        marker: new maplibregl.Marker({ element: markerElement(marker), anchor: marker.kind === 'vehicle' || marker.kind === 'user' ? 'center' : 'bottom' })
          .setLngLat([marker.longitude, marker.latitude])
          .addTo(map),
        signature,
      })
    }
    for (const [id, cached] of Array.from(markersRef.current.entries())) {
      if (seen.has(id)) continue
      cached.marker.remove()
      markersRef.current.delete(id)
    }
  }, [markers, styleReady, attempt])

  // Follow the vehicle without stealing the user's pan; a fitted route owns the camera.
  // Only a vehicle fix moves the view — a trip's endpoints are static.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !follow || !vehicle || hasRoute || parkedRef.current) return
    map.easeTo({ center: [vehicle.longitude, vehicle.latitude], duration: 450 })
  }, [vehicle?.longitude, vehicle?.latitude, follow, hasRoute, vehicle])

  if (focusLon === null || focusLat === null) {
    return (
      <div className={cn('relative overflow-hidden rounded-xl border border-line bg-surface-muted', className)} role="img" aria-label={ariaLabel}>
        {placeholder}
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-line bg-canvas', className)}>
      <div ref={containerRef} className="ds-map" role="img" aria-label={ariaLabel} />
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas/95 px-6 text-center">
          <p className="text-[13px] font-medium text-ink">Map data could not be loaded</p>
          <p className="max-w-[340px] text-[12px] leading-4 text-ink-secondary">
            The vehicle position is still correct — only the basemap is missing. This browser could not reach tiles.openfreemap.org, which is usually a filtered
            network or a DNS blocklist rather than an outage.
          </p>
          <button
            type="button"
            onClick={() => {
              setFailed(false)
              setAttempt((previous) => previous + 1)
            }}
            className="mt-1 h-9 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink shadow-xs transition hover:bg-surface-muted"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
