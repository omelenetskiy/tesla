import { buildRouteForSamples, getRoutePoints, resolveTripLocations } from '@/lib/tesla/trip-locations'

describe('trip-locations helpers', () => {
  it('filters invalid route points', () => {
    const points = getRoutePoints([
      [30.5234, 50.4501],
      [181, 10],
      [20],
      [37.6173, 55.7558],
    ] as Array<[number, number]>)

    expect(points).toEqual([
      [30.5234, 50.4501],
      [37.6173, 55.7558],
    ])
  })

  it('prefers explicit start/end locations when valid', () => {
    const result = resolveTripLocations({
      startLocation: { latitude: 50.45, longitude: 30.52, heading: null, source: 'live', accuracy: null },
      endLocation: { latitude: 50.46, longitude: 30.54, heading: null, source: 'live', accuracy: null },
      route: [[30.0, 50.0]],
    })

    expect(result.startLocation).toEqual({ lat: 50.45, lng: 30.52, name: 'Start point' })
    expect(result.endLocation).toEqual({ lat: 50.46, lng: 30.54, name: 'End point' })
  })

  it('infers start/end from route when explicit locations are missing', () => {
    const result = resolveTripLocations({
      startLocation: null,
      endLocation: null,
      route: [
        [13.405, 52.52],
        [14.5058, 46.0569],
      ],
    })

    expect(result.startLocation).toEqual({ lat: 52.52, lng: 13.405, name: 'Start point (inferred)' })
    expect(result.endLocation).toEqual({ lat: 46.0569, lng: 14.5058, name: 'End point (inferred)' })
  })

  it('builds fallback two-point route when route samples are empty but start/end are known', () => {
    const route = buildRouteForSamples(
      [],
      { lat: 52.52, lng: 13.405, name: 'Start point' },
      { lat: 48.8566, lng: 2.3522, name: 'End point' },
    )

    expect(route).toEqual([
      [13.405, 52.52],
      [2.3522, 48.8566],
    ])
  })
})

