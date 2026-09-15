import { computeEnergyForSession, type EnergyAccounting, type EnergyActivity, type PowerSample } from './accounting'

export type TelemetrySessionSampleRow = {
  session_id: string
  session_type: 'trip' | 'charging' | 'parked'
  field_name: string
  numeric_value: number | null
  observed_at: string
}

export type SessionEnergyResult = {
  sessionId: string
  sessionType: TelemetrySessionSampleRow['session_type']
  accounting: EnergyAccounting | null
}

function canonicalFieldName(fieldName: string): string {
  return fieldName.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function activityFor(sessionType: TelemetrySessionSampleRow['session_type']): EnergyActivity {
  return sessionType === 'trip' ? 'driving' : sessionType
}

function isField(fieldName: string, candidates: string[]): boolean {
  return candidates.includes(canonicalFieldName(fieldName))
}

/**
 * Converts the normalized per-field rows from telemetry_session_samples into
 * timestamp-coalesced power samples. Rows from different sessions are never mixed.
 */
export function groupTelemetryPowerSamples(rows: TelemetrySessionSampleRow[]): Map<string, { sessionType: TelemetrySessionSampleRow['session_type']; samples: PowerSample[] }> {
  const grouped = new Map<string, { sessionType: TelemetrySessionSampleRow['session_type']; byTime: Map<string, PowerSample> }>()

  for (const row of rows) {
    if (!row.session_id || !row.observed_at) continue
    const entry = grouped.get(row.session_id) ?? { sessionType: row.session_type, byTime: new Map<string, PowerSample>() }
    const sample = entry.byTime.get(row.observed_at) ?? { timestamp: row.observed_at, activity: activityFor(entry.sessionType) }
    const value = row.numeric_value

    if (isField(row.field_name, ['powerkw', 'power'])) sample.powerKw = value
    if (isField(row.field_name, ['voltagev', 'voltage', 'chargervoltage'])) sample.voltageV = value
    if (isField(row.field_name, ['currenta', 'current', 'chargeamps', 'chargercurrent'])) sample.currentA = value

    entry.byTime.set(row.observed_at, sample)
    grouped.set(row.session_id, entry)
  }

  return new Map(
    Array.from(grouped, ([sessionId, entry]) => [
      sessionId,
      {
        sessionType: entry.sessionType,
        samples: Array.from(entry.byTime.values()).sort((left, right) => Date.parse(String(left.timestamp)) - Date.parse(String(right.timestamp))),
      },
    ]),
  )
}

/** Calculates verified energy independently for every persisted session. */
export function calculateEnergyBySession(rows: TelemetrySessionSampleRow[], maxGapMs?: number): SessionEnergyResult[] {
  return Array.from(groupTelemetryPowerSamples(rows), ([sessionId, group]) => ({
    sessionId,
    sessionType: group.sessionType,
    accounting: computeEnergyForSession(group.samples, maxGapMs),
  }))
}

