import type { NextRequest } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-server'
import { readVehicleStatus, resolveVehicle } from '@/lib/tesla/service'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) => ({
      status: init.status ?? 200,
      headers: new Map(Object.entries(init.headers ?? {})),
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/supabase-server', () => ({
  getAuthenticatedUser: jest.fn(),
}))

jest.mock('@/lib/tesla/service', () => ({
  readVehicleStatus: jest.fn(),
  resolveVehicle: jest.fn(),
}))

import { GET } from '@/app/api/vehicle/status/route'

const mockedGetAuthenticatedUser = jest.mocked(getAuthenticatedUser)
const mockedReadVehicleStatus = jest.mocked(readVehicleStatus)
const mockedResolveVehicle = jest.mocked(resolveVehicle)

const vehicle = { id: 'vehicle-1', owner_id: 'owner-1' } as never

function request(vehicleId = 'vehicle-1') {
  return { nextUrl: new URL(`http://localhost/api/vehicle/status?vehicleId=${vehicleId}`) } as NextRequest
}

describe('GET /api/vehicle/status', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('rejects unauthenticated requests before resolving a vehicle', async () => {
    mockedGetAuthenticatedUser.mockResolvedValue(null)

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: 'Sign-in required' })
    expect(mockedResolveVehicle).not.toHaveBeenCalled()
  })

  it('scopes vehicle lookup to the authenticated owner', async () => {
    mockedGetAuthenticatedUser.mockResolvedValue({ id: 'owner-1' } as never)
    mockedResolveVehicle.mockResolvedValue(null)

    const response = await GET(request('vehicle-2'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: 'Vehicle not connected' })
    expect(mockedResolveVehicle).toHaveBeenCalledWith('owner-1', 'vehicle-2')
    expect(mockedReadVehicleStatus).not.toHaveBeenCalled()
  })

  it('returns null telemetry fields when no snapshot exists', async () => {
    mockedGetAuthenticatedUser.mockResolvedValue({ id: 'owner-1' } as never)
    mockedResolveVehicle.mockResolvedValue(vehicle)
    mockedReadVehicleStatus.mockResolvedValue({
      collectedAt: '2026-09-15T12:00:00.000Z',
      ageSeconds: 0,
      freshness: 'offline',
      source: 'none',
      collectionReason: 'no_snapshot',
      status: null,
      error: null,
      authState: null,
      wakeHint: false,
    })

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      vehicleId: 'vehicle-1',
      batteryLevel: null,
      latitude: null,
      longitude: null,
      isSleeping: null,
      isLive: false,
      freshness: 'offline',
      source: 'none',
    })
    expect(body).not.toHaveProperty('demo')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('maps verified snapshot telemetry without fixed demo values', async () => {
    mockedGetAuthenticatedUser.mockResolvedValue({ id: 'owner-1' } as never)
    mockedResolveVehicle.mockResolvedValue(vehicle)
    mockedReadVehicleStatus.mockResolvedValue({
      collectedAt: '2026-09-15T12:00:00.000Z',
      ageSeconds: 2,
      freshness: 'live',
      source: 'tesla_api',
      collectionReason: 'vehicle_online',
      status: {
        presence: 'sleeping',
        drive: { latitude: 51.5074, longitude: -0.1278 },
        charge: { stateOfCharge: 42 },
      } as never,
      error: null,
      authState: 'AUTHORIZED',
      wakeHint: false,
    })

    const response = await GET(request())
    const body = await response.json()

    expect(body).toMatchObject({
      vehicleId: 'vehicle-1',
      batteryLevel: 42,
      latitude: 51.5074,
      longitude: -0.1278,
      isSleeping: true,
      lastUpdatedAt: '2026-09-15T12:00:00.000Z',
      isLive: true,
      source: 'tesla_api',
    })
    expect(mockedReadVehicleStatus).toHaveBeenCalledWith({ row: vehicle })
  })
})

