'use client'

import {useEffect, useRef} from 'react'
import * as maplibregl from 'maplibre-gl'
import type {Vehicle} from '../data'

type LiveMapProps = {
    vehicle: Vehicle
    onSelectAction: (id: string) => void
    fullHeight?: boolean
}

export default function LiveMap({vehicle, onSelectAction, fullHeight = false}: LiveMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const markers = useRef<Record<string, maplibregl.Marker>>({})

    useEffect(() => {
        if (!mapContainer.current || map.current) return
        map.current = new maplibregl.Map({
            container: mapContainer.current,
            center: [-122.672, 45.515],
            zoom: 11.6,
            style: {
                version: 8,
                sources: {
                    osm: {
                        type: 'raster',
                        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                        tileSize: 256,
                        attribution: '© OpenStreetMap contributors'
                    }
                },
                layers: [{
                    id: 'osm',
                    type: 'raster',
                    source: 'osm',
                    paint: {'raster-saturation': -0.75, 'raster-contrast': -0.05, 'raster-brightness-max': 0.96}
                }],
            },
            attributionControl: false,
        })
        map.current.addControl(new maplibregl.NavigationControl({showCompass: false}), 'bottom-right')
        map.current.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-left')

        return () => {
            map.current?.remove();
            map.current = null
        }
    }, [])

    useEffect(() => {
        if (!map.current) return
        const marker = markers.current[vehicle.id]
        const element = (marker?.getElement() ?? document.createElement('button')) as HTMLButtonElement
        element.className = `vehicle-marker ${vehicle.state.toLowerCase()} selected`
        element.type = 'button'
        element.setAttribute('aria-label', `Select ${vehicle.name}, ${vehicle.state}`)
        element.innerHTML = `<span class="vehicle-marker-core" style="--marker-color:${vehicle.color}"></span><span class="vehicle-marker-label">${vehicle.name}</span>`
        element.onclick = () => onSelectAction(vehicle.id)
        if (!marker) markers.current[vehicle.id] = new maplibregl.Marker({element}).setLngLat(vehicle.coordinates).addTo(map.current!)
        else marker.setLngLat(vehicle.coordinates)
    }, [vehicle, onSelectAction])

    return <div ref={mapContainer} className={`map-view ${fullHeight ? 'map-view-full' : ''}`}
                aria-label="Interactive Tesla location map"/>
}
