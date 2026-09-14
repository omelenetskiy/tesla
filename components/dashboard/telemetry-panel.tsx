'use client'

import * as React from 'react'
import { Activity, Battery, Gauge, Thermometer, Zap, Wind, Droplet, AlertTriangle, Signal, Smartphone, Cpu, RotateCcw } from 'lucide-react'
import { Card, Figure, Meter, StateWord, type Tone } from '@/components/dashboard/cards'
import type { VehicleStatus, ChargingConnection } from '@/lib/tesla/models'
import { formatPercent, formatKwh, formatKw, formatKvh, formatAmps, formatVolts, formatTempCelsius, formatPsi } from '@/lib/format'

interface TelemetryMetrics {
  packVoltage?: number | null
  packCurrent?: number | null
  powerKw?: number | null
  cellCount?: number | null
  cellImbalance?: number | null
  insideTempC?: number | null
  outsideTempC?: number | null
  batteryHeaterOn?: boolean | null
  tpmsFlPressure?: number | null
  tpmsFrPressure?: number | null
  tpmsRlPressure?: number | null
  tpmsRrPressure?: number | null
  softwareUpdateProgress?: number | null
  connectivity?: string | null
  milesSinceReset?: number | null
  selfDrivingMilesSinceReset?: number | null
}

interface TelemetryPanelProps {
  vehicle: VehicleStatus
  telemetry?: TelemetryMetrics
  isLoading?: boolean
}

function getTirePressureTone(psi: number | null | undefined): Tone {
  if (!psi) return 'secondary'
  if (psi < 20 || psi > 55) return 'warn'
  if (psi < 30 || psi > 50) return 'caution'
  return 'good'
}

function getPowerTone(kw: number | null | undefined): Tone {
  if (!kw) return 'secondary'
  if (kw > 200) return 'warn'
  if (kw > 100) return 'caution'
  return 'good'
}

function getTemperatureTone(tempC: number | null | undefined): Tone {
  if (tempC === null || tempC === undefined) return 'secondary'
  if (tempC < -20 || tempC > 50) return 'warn'
  if (tempC < -10 || tempC > 45) return 'caution'
  return 'good'
}

/**
 * Extended telemetry panel showing real-time battery, thermal, and system metrics
 * Displayed when Fleet Telemetry is configured and actively receiving data
 */
export function TelemetryPanel({ vehicle, telemetry, isLoading }: TelemetryPanelProps) {
  if (!telemetry || isLoading) {
    return (
      <Card className="col-span-full lg:col-span-2">
        <div className="flex items-center gap-2 text-secondary">
          <Activity className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Waiting for telemetry data...</span>
        </div>
      </Card>
    )
  }

  return (
    <>
      {/* Battery & Power Section */}
      <Card className="col-span-full lg:col-span-2">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Battery className="h-4 w-4" />
          Battery & Power
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {telemetry.packVoltage && (
            <div>
              <div className="text-xs text-secondary mb-1">Pack Voltage</div>
              <Figure value={formatVolts(telemetry.packVoltage)} tone="good" />
            </div>
          )}
          {telemetry.packCurrent !== null && telemetry.packCurrent !== undefined && (
            <div>
              <div className="text-xs text-secondary mb-1">Pack Current</div>
              <Figure value={formatAmps(telemetry.packCurrent)} tone={telemetry.packCurrent > 100 ? 'caution' : 'good'} />
            </div>
          )}
          {telemetry.powerKw && (
            <div>
              <div className="text-xs text-secondary mb-1">Power</div>
              <Figure value={formatKw(telemetry.powerKw)} tone={getPowerTone(telemetry.powerKw)} />
            </div>
          )}
          {vehicle.chargeState?.stateOfCharge && (
            <div>
              <div className="text-xs text-secondary mb-1">Battery Level</div>
              <Figure value={formatPercent(vehicle.chargeState.stateOfCharge / 100)} tone={vehicle.chargeState.stateOfCharge < 20 ? 'warn' : 'good'} />
            </div>
          )}
        </div>
      </Card>

      {/* Thermal Management */}
      <Card className="col-span-full lg:col-span-2">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Thermometer className="h-4 w-4" />
          Thermal
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {telemetry.insideTempC !== null && (
            <div>
              <div className="text-xs text-secondary mb-1">Cabin Temp</div>
              <Figure value={formatTempCelsius(telemetry.insideTempC)} tone={getTemperatureTone(telemetry.insideTempC)} />
            </div>
          )}
          {telemetry.outsideTempC !== null && (
            <div>
              <div className="text-xs text-secondary mb-1">Ambient Temp</div>
              <Figure value={formatTempCelsius(telemetry.outsideTempC)} tone={getTemperatureTone(telemetry.outsideTempC)} />
            </div>
          )}
          {telemetry.batteryHeaterOn !== null && (
            <div>
              <div className="text-xs text-secondary mb-1">Battery Heater</div>
              <StateWord state={telemetry.batteryHeaterOn ? 'on' : 'off'} tone={telemetry.batteryHeaterOn ? 'caution' : 'good'} />
            </div>
          )}
        </div>
      </Card>

      {/* Tire Pressure Monitoring */}
      <Card className="col-span-full lg:col-span-2">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Droplet className="h-4 w-4" />
          Tire Pressure
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'FL', psi: telemetry.tpmsFlPressure },
            { label: 'FR', psi: telemetry.tpmsFrPressure },
            { label: 'RL', psi: telemetry.tpmsRlPressure },
            { label: 'RR', psi: telemetry.tpmsRrPressure },
          ].map((tire) => (
            <div key={tire.label}>
              <div className="text-xs text-secondary mb-1">{tire.label}</div>
              {tire.psi ? (
                <Figure value={formatPsi(tire.psi)} tone={getTirePressureTone(tire.psi)} />
              ) : (
                <div className="text-xs text-secondary">N/A</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* System Status */}
      <Card className="col-span-full lg:col-span-2">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Signal className="h-4 w-4" />
          System
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {telemetry.connectivity && (
            <div>
              <div className="text-xs text-secondary mb-1">Connectivity</div>
              <StateWord state={telemetry.connectivity} tone="good" />
            </div>
          )}
          {telemetry.softwareUpdateProgress !== null && telemetry.softwareUpdateProgress !== undefined && (
            <div>
              <div className="text-xs text-secondary mb-1">Update Progress</div>
              <Meter value={telemetry.softwareUpdateProgress / 100} tone={telemetry.softwareUpdateProgress > 0 ? 'caution' : 'good'} />
            </div>
          )}
        </div>
      </Card>

      {/* Mileage & Efficiency */}
      <Card className="col-span-full lg:col-span-2">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Efficiency
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {telemetry.milesSinceReset !== null && (
            <div>
              <div className="text-xs text-secondary mb-1">Miles (Reset)</div>
              <Figure value={telemetry.milesSinceReset.toFixed(1)} tone="good" />
            </div>
          )}
          {telemetry.selfDrivingMilesSinceReset !== null && (
            <div>
              <div className="text-xs text-secondary mb-1">Autopilot Miles</div>
              <Figure value={telemetry.selfDrivingMilesSinceReset.toFixed(1)} tone="good" />
            </div>
          )}
        </div>
      </Card>

      {/* Charging Details */}
      {vehicle.chargeState && (
        <Card className="col-span-full lg:col-span-2">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Charging
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {vehicle.chargeState.chargerVoltage && (
              <div>
                <div className="text-xs text-secondary mb-1">Charger Voltage</div>
                <Figure value={formatVolts(vehicle.chargeState.chargerVoltage)} tone="good" />
              </div>
            )}
            {vehicle.chargeState.chargerActualCurrentA && (
              <div>
                <div className="text-xs text-secondary mb-1">Charger Current</div>
                <Figure value={formatAmps(vehicle.chargeState.chargerActualCurrentA)} tone="good" />
              </div>
            )}
            {vehicle.chargeState.chargerPowerKw && (
              <div>
                <div className="text-xs text-secondary mb-1">Charger Power</div>
                <Figure value={formatKw(vehicle.chargeState.chargerPowerKw)} tone="good" />
              </div>
            )}
            {vehicle.chargeState.chargeRateKmh && (
              <div>
                <div className="text-xs text-secondary mb-1">Charge Rate</div>
                <Figure value={`${vehicle.chargeState.chargeRateKmh.toFixed(1)} km/h`} tone="good" />
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  )
}

