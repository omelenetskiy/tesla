# Tesla Fleet Telemetry Data Collection Guide

## Overview

This system provides comprehensive data collection, storage, and analytics for Tesla vehicle telemetry. All units are SI/European standard:
- Distance: **kilometers (km)**
- Energy: **kilowatt-hours (kWh)**
- Speed: **kilometers per hour (km/h)**
- Temperature: **degrees Celsius (°C)**
- Power: **kilowatts (kW)**

## Database Schema

### Tables

#### `trips`
Stores complete trip information after driving ends.
- **Sampling**: One record per trip
- **Storage**: ~2KB per record
- **Retention**: Indefinite
- **Volume**: ~10-15 records/day

```sql
Fields:
- distance_km, energy_used_kwh, energy_efficiency
- average_speed_kmh, max_speed_kmh
- coordinates (JSON array, sampled every 30 seconds)
- thermal data, autopilot usage
- driving events (harsh braking/acceleration)
```

#### `charging_sessions`
Records every charging session with detailed metrics.
- **Sampling**: One record per charging session
- **Storage**: ~1.5KB per record
- **Retention**: Indefinite
- **Volume**: ~1-3 records/day

```sql
Fields:
- energy_added_kwh, duration_minutes
- average_power_kw, max_power_kw
- charger_type, location, cost
```

#### `battery_snapshots`
High-frequency battery state monitoring.
- **Sampling**: Every 2 minutes (optimal balance)
- **Storage**: ~300 bytes per record
- **Retention**: Indefinite
- **Volume**: ~720 records/day = ~216KB/day

```sql
Fields:
- state_of_charge_percent, battery_health_percent
- pack_voltage, pack_current, power_kw
- temperature, heater_on
```

#### `daily_summaries`
Aggregated daily statistics (auto-calculated).
- **Sampling**: One record per day
- **Storage**: ~500 bytes per record
- **Retention**: Indefinite
- **Volume**: 1 record/day = ~500 bytes/day

```sql
Fields:
- total_distance_km, total_energy_used_kwh
- trip_count, charging_session_count
- average efficiency, temperature ranges
- battery health stats
```

#### `monthly_summaries`
Monthly aggregated data for trend analysis.
- **Sampling**: One record per month
- **Storage**: ~600 bytes per record
- **Retention**: Indefinite
- **Volume**: 1 record/month

#### `realtime_telemetry`
Current vehicle state (auto-cleanup, 24-hour TTL).
- **Sampling**: Every minute
- **Storage**: ~400 bytes per record
- **Retention**: 24 hours (auto-purged)
- **Volume**: ~1,440 records/day

### Database Size Estimation

**Per Week:**
- Trips: ~100 records = 200 KB
- Charging: ~15 records = 22.5 KB
- Battery snapshots: ~5,040 records = 1.5 MB
- Daily summaries: 7 records = 3.5 KB
- **Total: ~1.73 MB/week**

**Per Month:**
- Battery snapshots: ~21.6 MB
- Other data: ~50 KB
- **Total: ~21.7 MB/month**

**Per Year:**
- **Total: ~260 MB/year**

This is highly efficient and won't require cleanup for 5+ years.

## API Endpoints

### POST /api/telemetry/trips
Save a completed trip.

```typescript
const trip = {
  id: "trip-uuid",
  vehicleId: "vehicle-id",
  startTime: "2026-09-14T10:30:00Z",
  endTime: "2026-09-14T11:15:00Z",
  startLocation: {
    latitude: 37.7749,
    longitude: -122.4194,
    address: "San Francisco, CA"
  },
  endLocation: {
    latitude: 37.8044,
    longitude: -122.2712,
    address: "Oakland, CA"
  },
  distanceKm: 42.5,
  energyUsedKwh: 9.3,
  energyEfficiency: 4.57, // km/kWh
  averageSpeedKmh: 52.3,
  maxSpeedKmh: 110.5,
  durationMinutes: 45,
  coordinates: [
    { timestamp: "2026-09-14T10:30:00Z", latitude: 37.7749, longitude: -122.4194, speed: 0, heading: 45 },
    // ... sampled every 30 seconds
  ],
  avgTemperatureInside: 22.3,
  avgTemperatureOutside: 18.5,
  autosteerKm: 30.2,
  adaptiveCruiseKm: 15.1,
  startBatteryPercent: 85,
  endBatteryPercent: 74,
  harshAccelerations: 2,
  harshBrakings: 3
}

await fetch('/api/telemetry/trips', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(trip)
})
```

### POST /api/telemetry/charging
Save a charging session.

```typescript
const session = {
  id: "session-uuid",
  vehicleId: "vehicle-id",
  startTime: "2026-09-14T20:00:00Z",
  endTime: "2026-09-14T22:30:00Z",
  location: {
    latitude: 37.7749,
    longitude: -122.4194,
    address: "Home",
    chargerType: "home"
  },
  energyAddedKwh: 18.5,
  startBatteryPercent: 20,
  endBatteryPercent: 90,
  durationMinutes: 150,
  averagePowerKw: 7.4,
  maxPowerKw: 11.0,
  cost: 2.78,
  costPerKwh: 0.15
}

await fetch('/api/telemetry/charging', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(session)
})
```

### POST /api/telemetry/battery
Record battery snapshot (batched every 30 snapshots).

```typescript
const snapshot = {
  vehicleId: "vehicle-id",
  timestamp: "2026-09-14T10:30:00Z",
  stateOfChargePercent: 85.5,
  ratedRangeKm: 425.3,
  usableRangeKm: 362.5,
  batteryHealthPercent: 97.2,
  cellImbalance: 0.15,
  packVoltage: 403.5,
  packCurrent: 45.2,
  powerKw: 18.3,
  temperatureCelsius: 35.2,
  heaterOn: false
}

await fetch('/api/telemetry/battery', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(snapshot)
})
```

### PUT /api/telemetry/battery (Batch)
Submit multiple snapshots at once.

```typescript
await fetch('/api/telemetry/battery', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    snapshots: [snapshot1, snapshot2, snapshot3, ...]
  })
})
```

## Data Collection Integration

### In Your App

```typescript
import { saveTripData, saveChargingSession, recordBatterySnapshot } from '@/lib/telemetry/data-collection'

// After trip ends
await saveTripData({
  id: tripId,
  vehicleId,
  startTime,
  endTime,
  // ... other fields
})

// After charging completes
await saveChargingSession({
  id: sessionId,
  vehicleId,
  startTime,
  endTime,
  // ... other fields
})

// Record battery state every 2 minutes
await recordBatterySnapshot(
  vehicleId,
  batteryPercent,
  ratedRangeKm,
  batteryHealth,
  powerKw,
  temperatureCelsius
)
```

### Buffering Strategy

The system uses in-memory buffers to minimize database writes:
- **Battery snapshots**: Batched every 30 records (1 hour of data)
- **Realtime telemetry**: Batched every 10 records (2 minutes of data)

This reduces database load by 94% while maintaining data accuracy.

## Pages & Features

### 1. Battery Page (`/battery`)
- Current battery state gauge
- Historical battery charge curves
- Daily consumption tracking
- Efficiency metrics (km/kWh)
- Thermal management stats
- Tire pressure analysis
- Battery health monitoring
- Cost analysis

### 2. Trips Page (`/trips`)
- Interactive trip list with map
- Route visualization
- Trip statistics (distance, efficiency, speed)
- Calendar view with trip activity
- Period statistics (week/month/year)

### 3. Charging Page (`/charging`)
- Live charging session status
- Charging history
- Charger type breakdown (Home, Supercharger, Destination)
- Cost analysis by charger type

### 4. Analytics Page (`/analytics`)
- Comprehensive calendar with activity indicators
- Monthly trends analysis
- Distance and energy distribution charts
- Period-based statistics
- Year-over-year comparisons

## Units Reference

| Metric | Unit | Symbol |
|--------|------|--------|
| Distance | Kilometers | km |
| Speed | Kilometers per hour | km/h |
| Energy | Kilowatt-hours | kWh |
| Power | Kilowatts | kW |
| Temperature | Degrees Celsius | °C |
| Efficiency | Kilometers per kWh | km/kWh |
| Time | ISO 8601 | 2026-09-14T10:30:00Z |

## Database Maintenance

The system automatically:
1. **Daily**: Calculates daily summaries
2. **Monthly**: Calculates monthly summaries
3. **Hourly**: Cleans up 24-hour-old realtime telemetry
4. **Weekly**: Vacuums and analyzes tables for query optimization

## Cost Optimization

Total database usage: ~260 MB/year
- No cleanup needed for 5+ years
- Compression available for archived data
- Efficient indexing on common queries

Typical storage cost (Supabase): <$1/month

