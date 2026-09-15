import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Get vehicle status from cache
    const vehicleId = request.nextUrl.searchParams.get('vehicleId') || 'vehicle-1'

    // Mock data - in production, fetch from telemetry DB
    const status = {
      vehicleId,
      batteryLevel: 75,
      latitude: 37.7749,
      longitude: -122.4194,
      isSleeping: false,
      lastUpdatedAt: new Date().toISOString(),
      isLive: true,
    }

    return NextResponse.json(status, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch vehicle status' },
      { status: 500 }
    )
  }
}

