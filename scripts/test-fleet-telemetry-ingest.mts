#!/usr/bin/env node

import assert from 'node:assert/strict'
import { applyTelemetryRecord, emptyVehicleStatus, parseTelemetryLogLine } from '@/lib/fleet/telemetry-ingest'

const row = {
  id: 'vehicle-1',
  display_name: 'Model Y',
  vehicle_tag_id: '1234567890',
  vehicle_id: '9876543210123456',
  vin: '7SAYGDEFXPF942896',
} as const

function line(payload: object) {
  return `fleet-telemetry_1 | ${JSON.stringify(payload)}`
}

const parsed = parseTelemetryLogLine(line({
  activity: true,
  context: 'fleet-telemetry',
  data: {
    CreatedAt: '2026-09-14T18:55:07Z',
    Soc: { intValue: 61 },
    VehicleSpeed: { doubleValue: 12.7 },
    Gear: { stringValue: 'D' },
    Vin: row.vin,
  },
  metadata: {
    txid: 'abc-1',
    txtype: 'V',
    vin: row.vin,
  },
  msg: 'record_payload',
  time: '2026-09-14T18:55:07.7967085Z',
  vin: row.vin,
}))

assert(parsed, 'expected the prefixed JSON line to parse')
const base = emptyVehicleStatus(row)
const first = applyTelemetryRecord(base, parsed!, row)
assert.equal(first.collectedAt, '2026-09-14T18:55:07.000Z')
assert.equal(first.status.charge.stateOfCharge, 61)
assert.equal(first.status.drive.speedKmh, 13)
assert.equal(first.status.drive.shiftState, 'D')
assert.equal(first.status.presence, 'driving')
assert.deepEqual(first.mappedFields, ['Soc', 'VehicleSpeed', 'Gear'])

const located = applyTelemetryRecord(first.status, parseTelemetryLogLine(line({
  activity: true,
  data: {
    CreatedAt: '2026-09-14T19:00:00Z',
    Location: { locationValue: { latitude: 37.412374, longitude: -122.145867 } },
    GpsHeading: { doubleValue: 278.47204609523567 },
    DoorState: { doorValue: { DriverFront: false, DriverRear: false, PassengerFront: false, PassengerRear: false } },
    Locked: { boolValue: true },
    ChargePortDoorOpen: { boolValue: false },
    Vin: row.vin,
  },
  metadata: { txid: 'abc-2', txtype: 'V', vin: row.vin },
  msg: 'record_payload',
  vin: row.vin,
}))!, row)

assert.equal(located.status.drive.latitude, 37.412374)
assert.equal(located.status.drive.longitude, -122.145867)
assert.equal(located.status.drive.heading, 278)
assert.equal(located.status.state.locked, true)
assert.equal(located.status.charge.chargePortOpen, false)
assert.deepEqual(located.status.state.doors, { driverFront: false, driverRear: false, passengerFront: false, passengerRear: false })
assert.equal(located.status.connectivity, 'online')

const charging = applyTelemetryRecord(located.status, parseTelemetryLogLine(line({
  activity: true,
  data: {
    CreatedAt: '2026-09-14T19:05:00Z',
    DetailedChargeState: { detailedChargeState: 'DetailedChargeStateDisconnected' },
    ChargerVoltage: { doubleValue: 240 },
    ChargeAmps: { doubleValue: 32 },
    Vin: row.vin,
  },
  metadata: { txid: 'abc-3', txtype: 'V', vin: row.vin },
  msg: 'record_payload',
  vin: row.vin,
}))!, row)

assert.equal(charging.status.charge.chargingConnection, 'disconnected')
assert.equal(charging.status.charge.chargerVoltage, 240)
assert.equal(charging.status.charge.chargerActualCurrentA, 32)
assert.equal(charging.status.presence, 'driving')

const ignored = parseTelemetryLogLine('fleet-telemetry_1 | {"msg":"connectivity"}')
assert.equal(ignored, null)

console.log('fleet telemetry ingest parser tests passed')

