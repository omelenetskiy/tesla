import type { VehicleRow } from '@/lib/tesla/service'
import type { TelemetryLogRecord } from './telemetry-ingest'

export type TelemetrySessionType = 'trip' | 'charging' | 'parked'

export type TelemetrySampleWrite = {
  vehicle_id_param: string
  owner_id_param: string
  session_id: string
  session_type: TelemetrySessionType
  field_name: string
  numeric_value: number | null
  text_value: string | null
  observed_at_param: string
}

export type TelemetrySampleInput = {
  row: Pick<VehicleRow, 'id' | 'owner_id'>
  record: TelemetryLogRecord
  observedAt: string
}

type RpcClient = {
  rpc: (...args: any[]) => PromiseLike<{ error: { message?: string } | null }>
}

const FIELD_MAP: Record<string, { name: string; numeric: boolean }> = {
  Soc: { name: 'battery_level', numeric: true },
    EstBatteryRange: { name: 'estimated_range', numeric: true },
    IdealBatteryRange: { name: 'ideal_range', numeric: true },
    VehicleSpeed: { name: 'speed', numeric: true },
    Odometer: { name: 'odometer', numeric: true },
    ChargerVoltage: { name: 'voltage', numeric: true },
    ChargeAmps: { name: 'current', numeric: true },
    ChargePower: { name: 'power', numeric: true },
    Power: { name: 'power', numeric: true },
    OutsideTemp: { name: 'outside_temperature', numeric: true },
    InsideTemp: { name: 'inside_temperature', numeric: true },
  DetailedChargeState: { name: 'charge_state', numeric: false },
}

function sessionContext(record: TelemetryLogRecord): { id: string; type: TelemetrySessionType } | null {
  const id = record.metadata?.session_id?.trim()
  const type = record.metadata?.session_type
  if (!id || (type !== 'trip' && type !== 'charging' && type !== 'parked')) return null
  return { id, type }
}

function unwrap(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const object = value as Record<string, unknown>
  for (const key of ['stringValue', 'doubleValue', 'floatValue', 'intValue', 'integerValue', 'uintValue', 'numberValue', 'boolValue', 'booleanValue']) {
    if (key in object) return object[key]
  }
  return value
}

function numericValue(value: unknown): number | null {
  const raw = unwrap(value)
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function textValue(value: unknown): string | null {
  const raw = unwrap(value)
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return null
}

/** Builds one idempotent RPC payload per supported field in an explicitly scoped session. */
export function buildTelemetrySamplePlan(input: TelemetrySampleInput): TelemetrySampleWrite[] {
  const context = sessionContext(input.record)
  if (!context) return []

  const data = input.record.data ?? {}
  return Object.entries(data).flatMap(([sourceField, rawValue]) => {
    const mapping = FIELD_MAP[sourceField]
    if (!mapping) return []
    const numeric = mapping.numeric ? numericValue(rawValue) : null
    const text = mapping.numeric ? null : textValue(rawValue)
    if (mapping.numeric && numeric === null) return []
    if (!mapping.numeric && text === null) return []
    return [{
      vehicle_id_param: input.row.id,
      owner_id_param: input.row.owner_id,
      session_id: context.id,
      session_type: context.type,
      field_name: mapping.name,
      numeric_value: numeric,
      text_value: text,
      observed_at_param: input.observedAt,
    }]
  })
}

/** Persists samples through migration 010's SECURITY DEFINER, duplicate-safe RPC. */
export async function persistTelemetrySamples(client: RpcClient, input: TelemetrySampleInput): Promise<number> {
  const plan = buildTelemetrySamplePlan(input)
  for (const sample of plan) {
    const result = await client.rpc('record_telemetry_sample', sample)
    if (result.error) throw new Error(`Failed to persist telemetry sample: ${result.error.message ?? 'unknown error'}`)
  }
  return plan.length
}
