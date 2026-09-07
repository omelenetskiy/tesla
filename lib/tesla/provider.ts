import type { VehiclePresence, VehicleStatusSnapshot } from './models'

/**
 * §22 — the UI talks to this interface only, never to a polling loop.
 * A `StreamingProvider` (Owner API WSS, §26's Streaming group) can be substituted
 * without touching a component, which is the whole point of the indirection.
 */
export interface VehicleDataProvider {
  /** Cache-first read. Must be callable on every navigation without side effects. */
  read(): Promise<VehicleStatusSnapshot>
  /**
   * Explicit fresh read. `mayWake` must be true only when the user has confirmed the
   * wake warning; otherwise an asleep vehicle is answered from cache (AGENTS.md §3.2).
   */
  refresh(options?: { mayWake?: boolean }): Promise<VehicleStatusSnapshot>
  /** Reserved for the streaming implementation; polling returns a no-op unsubscribe. */
  subscribe?(listener: (snapshot: VehicleStatusSnapshot) => void): () => void
  describe(): ProviderDescriptor
}

export type ProviderDescriptor = {
  kind: 'polling' | 'streaming'
  /** Per-state cadence, so Settings can render the live policy instead of a guess. */
  policy: Record<VehiclePresence, PollingRule>
  configurable: boolean
}

export type PollingRule = {
  /** How long a cached snapshot stays authoritative before a provider read is needed. */
  cacheMs: number
  /** Minimum interval between live Owner API reads for a vehicle in this state. */
  liveMs: number
  /** False ⇒ the collector must not call `vehicle_data` in this state at all. */
  mayRequestTelemetry: boolean
  wakeAllowed: boolean
}

/**
 * §21 state-aware cadence. Driving is cheap because the car is already awake and
 * moving; sleeping stops aggressive polling outright, which is the battery-drain
 * failure the brief calls out. Values are overridable per vehicle via
 * `vehicles.polling_profile` so a fleet-style deployment can tighten them.
 */
export const DEFAULT_POLLING_POLICY: Record<VehiclePresence, PollingRule> = {
  driving: { cacheMs: 5_000, liveMs: 10_000, mayRequestTelemetry: true, wakeAllowed: false },
  charging: { cacheMs: 10_000, liveMs: 30_000, mayRequestTelemetry: true, wakeAllowed: false },
  parked: { cacheMs: 5 * 60_000, liveMs: 5 * 60_000, mayRequestTelemetry: true, wakeAllowed: false },
  sleeping: { cacheMs: 60 * 60_000, liveMs: 30 * 60_000, mayRequestTelemetry: false, wakeAllowed: false },
  offline: { cacheMs: 30 * 60_000, liveMs: 15 * 60_000, mayRequestTelemetry: false, wakeAllowed: false },
}

export const RELAXED_POLLING_POLICY: Record<VehiclePresence, PollingRule> = {
  driving: { cacheMs: 15_000, liveMs: 30_000, mayRequestTelemetry: true, wakeAllowed: false },
  charging: { cacheMs: 30_000, liveMs: 60_000, mayRequestTelemetry: true, wakeAllowed: false },
  parked: { cacheMs: 15 * 60_000, liveMs: 15 * 60_000, mayRequestTelemetry: true, wakeAllowed: false },
  sleeping: { cacheMs: Number.MAX_SAFE_INTEGER, liveMs: Number.MAX_SAFE_INTEGER, mayRequestTelemetry: false, wakeAllowed: false },
  offline: { cacheMs: Number.MAX_SAFE_INTEGER, liveMs: Number.MAX_SAFE_INTEGER, mayRequestTelemetry: false, wakeAllowed: false },
}

export const PASSIVE_POLLING_POLICY: Record<VehiclePresence, PollingRule> = Object.fromEntries(
  (Object.keys(DEFAULT_POLLING_POLICY) as VehiclePresence[]).map((presence) => [
    presence,
    { ...DEFAULT_POLLING_POLICY[presence], mayRequestTelemetry: false, liveMs: Number.MAX_SAFE_INTEGER },
  ]),
) as Record<VehiclePresence, PollingRule>

export const POLLING_PROFILES = {
  default: DEFAULT_POLLING_POLICY,
  relaxed: RELAXED_POLLING_POLICY,
  passive: PASSIVE_POLLING_POLICY,
} as const

export type PollingProfile = keyof typeof POLLING_PROFILES

export function policyFor(profile: string | null | undefined): Record<VehiclePresence, PollingRule> {
  if (profile && profile in POLLING_PROFILES) return POLLING_PROFILES[profile as PollingProfile]
  return DEFAULT_POLLING_POLICY
}

/**
 * Decides whether a read is allowed to reach Tesla at all, given the age of the
 * newest snapshot. Exported for tests: this is the single gate that keeps a
 * dashboard reload from becoming a polling loop (AGENTS.md §3.2 step 2).
 */
export function shouldCollect(input: {
  policy: Record<VehiclePresence, PollingRule>
  presence: VehiclePresence | null
  snapshotAgeMs: number | null
  force: boolean
  mayWake: boolean
}): { collect: boolean; reason: string } {
  const presence = input.presence ?? 'offline'
  const rule = input.policy[presence] ?? input.policy.offline
  if (!input.force && !rule.mayRequestTelemetry) {
    return { collect: false, reason: presence === 'sleeping' ? 'vehicle_sleeping' : 'policy_disallows_telemetry' }
  }
  if (!input.force && input.snapshotAgeMs !== null && input.snapshotAgeMs < rule.cacheMs) {
    return { collect: false, reason: 'fresh_cache' }
  }
  if (!input.force && input.snapshotAgeMs !== null && input.snapshotAgeMs < rule.liveMs) {
    return { collect: false, reason: 'within_live_interval' }
  }
  if (presence === 'sleeping' && !input.mayWake) return { collect: false, reason: 'wake_confirmation_required' }
  return { collect: true, reason: input.force ? 'user_requested' : 'policy_allowed' }
}
