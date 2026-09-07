'use client'

import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Vehicle } from '../data'

type LiveMapProps = {
    vehicle: Vehicle
    onSelectAction: (id: string) => void
    fullHeight?: boolean
    route?: [number, number][]
    focusCoordinates?: [number, number] | null
}

// Muted, clean map style inspired by the reference screenshots
const mutedStyle: maplibregl.StyleSpecification = {
    version: 8,
    sources: {
        osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
        },
    },
    layers: [
        {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            paint: {
                'raster-saturation': -0.9,
                'raster-contrast': -0.1,
                'raster-brightness-min': 0.85,
                'raster-brightness-max': 0.98,
                'raster-opacity': 0.7,
            },
        },
    ],
}

export default function LiveMap({ vehicle, onSelectAction, fullHeight = false, route, focusCoordinates }: LiveMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const markerRef = useRef<maplibregl.Marker | null>(null)
    const routeLayerRef = useRef<boolean>(false)
    const [isDark, setIsDark] = useState(false)

    // Detect theme for map style adjustment
    useEffect(() => {
        const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
        check()
        const observer = new MutationObserver(check)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!mapContainer.current || map.current) return

        const coords = focusCoordinates || vehicle.coordinates || [0, 0]
        map.current = new maplibregl.Map({
            container: mapContainer.current,
            center: coords,
            zoom: focusCoordinates || vehicle.coordinates ? 13 : 2,
            style: mutedStyle,
            attributionControl: false,
        })

        map.current.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'bottom-right')
        map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

        return () => {
            map.current?.remove()
            map.current = null
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Vehicle marker
    useEffect(() => {
        if (!map.current || !vehicle.coordinates) return

        const stateColor = vehicle.state === 'Driving' ? '#3b82f6' : vehicle.state === 'Charging' ? '#22c55e' : '#94a3b8'

        const el = document.createElement('button')
        el.className = `vehicle-marker ${vehicle.state.toLowerCase()} selected`
        el.type = 'button'
        el.setAttribute('aria-label', `${vehicle.name}, ${vehicle.state}`)
        el.innerHTML = `<span class="vehicle-marker-core"></span><span class="vehicle-marker-label">${vehicle.name}</span>`
        el.style.background = stateColor
        el.onclick = () => onSelectAction(vehicle.id)

        if (markerRef.current) {
            markerRef.current.setLngLat(vehicle.coordinates)
            const existing = markerRef.current.getElement()
            if (existing) {
                existing.style.background = stateColor
            }
        } else {
            markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat(vehicle.coordinates)
                .addTo(map.current!)
        }

        if (!focusCoordinates && !route?.length) {
            map.current.easeTo({ center: vehicle.coordinates, duration: 500 })
        }
    }, [vehicle, onSelectAction, focusCoordinates, route])

    // Trip route
    useEffect(() => {
        if (!map.current) return

        if (route?.length) {
            const sourceData: GeoJSON.Feature<GeoJSON.LineString> = {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: route },
                properties: {},
            }
            const source = map.current.getSource('trip-route') as maplibregl.GeoJSONSource | undefined
            if (source) {
                source.setData(sourceData)
            } else {
                map.current.addSource('trip-route', { type: 'geojson', data: sourceData })
                map.current.addLayer({
                    id: 'trip-route-line',
                    type: 'line',
                    source: 'trip-route',
                    paint: {
                        'line-color': '#3b82f6',
                        'line-width': 3,
                        'line-opacity': 0.85,
                    },
                })
                // Add a subtle glow layer
                map.current.addLayer({
                    id: 'trip-route-glow',
                    type: 'line',
                    source: 'trip-route',
                    paint: {
                        'line-color': '#3b82f6',
                        'line-width': 8,
                        'line-opacity': 0.15,
                    },
                }, 'trip-route-line')
            }

            const bounds = route.reduce((b: maplibregl.LngLatBounds, p: [number, number]) => b.extend(p), new maplibregl.LngLatBounds(route[0], route[0]))
            map.current.fitBounds(bounds, { padding: 50, duration: 600, maxZoom: 15 })
        } else if (routeLayerRef.current) {
            if (map.current.getLayer('trip-route-glow')) map.current.removeLayer('trip-route-glow')
            if (map.current.getLayer('trip-route-line')) map.current.removeLayer('trip-route-line')
            if (map.current.getSource('trip-route')) map.current.removeSource('trip-route')
            routeLayerRef.current = false
        }
        if (route?.length) routeLayerRef.current = true
    }, [route])

    return <div ref={mapContainer} className={`map-view ${fullHeight ? 'map-view-full' : ''}`} aria-label="Карта местоположения Tesla" />
}
