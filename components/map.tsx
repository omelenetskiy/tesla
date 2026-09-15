'use client'

import React, { useEffect, useRef } from 'react'
import { buildBasemapStyle } from '@/lib/map/basemap'
import { Card } from '@/components/ui/primitives'

type Coordinate = { lat: number; lng: number }
interface MapProps { latitude: number; longitude: number; zoom?: number; tripCoordinates?: Coordinate[]; style?: 'light' | 'dark' }
interface TripSamplePoint { lat: number; lng: number }

const isValidCoordinate = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180

export function Map({ latitude, longitude, zoom = 12, tripCoordinates = [], style = 'light' }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  useEffect(() => {
    if (!mapContainer.current) return
    const container = mapContainer.current
    const points = tripCoordinates.filter((point) => isValidCoordinate(point.lat, point.lng))
    let cancelled = false
    let activeMap: any = null
    const initMap = async () => {
      const maplibregl = await import('maplibre-gl')
      if (cancelled || !container.isConnected) return
      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
      const fallback = points[0] ?? { lat: 0, lng: 0 }
      activeMap = new maplibregl.Map({ container, style: buildBasemapStyle(style), center: isValidCoordinate(latitude, longitude) ? [longitude, latitude] : [fallback.lng, fallback.lat], zoom })
      if (cancelled) {
        activeMap.remove()
        activeMap = null
        return
      }
      map.current = activeMap
      if (points.length) {
        new maplibregl.Marker({ color: '#10B981' }).setLngLat([points[0].lng, points[0].lat]).addTo(activeMap)
        const last = points[points.length - 1]
        new maplibregl.Marker({ color: '#EF4444' }).setLngLat([last.lng, last.lat]).addTo(activeMap)
        activeMap.on('load', () => {
          if (cancelled || map.current !== activeMap || points.length < 2) return
          if (!activeMap.getSource('route')) activeMap.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: points.map((point) => [point.lng, point.lat]) } } })
          if (!activeMap.getLayer('route')) activeMap.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#3B82F6', 'line-width': 3 } })
          const bounds = new maplibregl.LngLatBounds()
          points.forEach((point) => bounds.extend([point.lng, point.lat]))
          activeMap.fitBounds(bounds, { padding: 48, maxZoom: 14 })
        })
      }
    }
    void initMap()
    return () => {
      cancelled = true
      if (map.current === activeMap) map.current = null
      activeMap?.remove()
      activeMap = null
    }
  }, [latitude, longitude, zoom, tripCoordinates, style])
  return <Card className="overflow-hidden"><div ref={mapContainer} className="w-full h-96 bg-gray-100 dark:bg-gray-800" style={{ minHeight: '400px' }} /></Card>
}

export function TripMap({ startLat, startLng, endLat, endLng, distance, samples = [] }: { startLat: number; startLng: number; endLat: number; endLng: number; distance: number; samples?: TripSamplePoint[] }) {
  const midLat = (startLat + endLat) / 2
  const midLng = (startLng + endLng) / 2
  const sampled = samples.filter((point) => isValidCoordinate(point.lat, point.lng))
  const fallback = [{ lat: startLat, lng: startLng }, { lat: midLat, lng: midLng }, { lat: endLat, lng: endLng }].filter((point) => isValidCoordinate(point.lat, point.lng))
  const route = sampled.length > 1 ? sampled : fallback
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg"><div className="text-xs text-blue-600 dark:text-blue-400 font-medium">START</div><div className="text-sm text-gray-900 dark:text-white mt-1">{startLat.toFixed(4)}, {startLng.toFixed(4)}</div></div><div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg"><div className="text-xs text-red-600 dark:text-red-400 font-medium">END</div><div className="text-sm text-gray-900 dark:text-white mt-1">{endLat.toFixed(4)}, {endLng.toFixed(4)}</div></div></div><Map latitude={midLat} longitude={midLng} zoom={11} tripCoordinates={route} /><div className="text-center text-sm text-gray-600 dark:text-gray-400">Distance: {distance.toFixed(1)} km</div></div>
}

export function ChargingLocationMap({ latitude, longitude, name }: { latitude: number; longitude: number; name: string }) {
  return <div className="space-y-4"><div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg"><div className="text-sm text-green-900 dark:text-green-100"><strong>Location:</strong> {name}</div><div className="text-xs text-green-800 dark:text-green-200 mt-1">{latitude.toFixed(4)}, {longitude.toFixed(4)}</div></div><Map latitude={latitude} longitude={longitude} zoom={15} /></div>
}


