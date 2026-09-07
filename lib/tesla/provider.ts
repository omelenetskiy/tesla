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
  /**
   * Whether the cheap, non-waking `GET /api/1/vehicles/{id}` probe is allowed.
   * This is what the cadence gates. Telemetry (`vehicle_data`) is decided
   * separately by the client from the probe's answer — it only ever fires when the
   * car reports `online`, so an asleep vehicle is never asked for data.
   */
  probeAllowed: boolean
  wakeAllowed: boolean
}

/**
 * §21 state-aware cadence. Driving is cheap because the car is already awake and
 * moving; sleeping keeps only a slow connectivity probe, which is how the app
 * notices the car woke up without a `wake_up` call. Values are overridable per
 * vehicle via `vehicles.polling_profile`.
 */
export const DEFAULT_POLLING_POLICY: Record<VehiclePresence, PollingRule> = {
  driving: { cacheMs: 5_000, liveMs: 10_000, probeAllowed: true, wakeAllowed: false },
  charging: { cacheMs: 10_000, liveMs: 30_000, probeAllowed: true, wakeAllowed: false },
  parked: { cacheMs: 5 * 60_000, liveMs: 5 * 60_000, probeAllowed: true, wakeAllowed: false },
  sleeping: { cacheMs: 60 * 60_000, liveMs: 30 * 60_000, probeAllowed: true, wakeAllowed: false },
  offline: { cacheMs: 30 * 60_000, liveMs: 15 * 60_000, probeAllowed: true, wakeAllowed: false },
}

export const RELAXED_POLLING_POLICY: Record<VehiclePresence, PollingRule> = {
  driving: { cacheMs: 15_000, liveMs: 30_000, probeAllowed: true, wakeAllowed: false },
  charging: { cacheMs: 30_000, liveMs: 60_000, probeAllowed: true, wakeAllowed: false },
  parked: { cacheMs: 15 * 60_000, liveMs: 15 * 60_000, probeAllowed: true, wakeAllowed: false },
  sleeping: { cacheMs: Number.MAX_SAFE_INTEGER, liveMs: 60 * 60_000, probeAllowed: true, wakeAllowed: false },
  offline: { cacheMs: Number.MAX_SAFE_INTEGER, liveMs: 60 * 60_000, probeAllowed: true, wakeAllowed: false },
}

/** Database-only: never reaches Tesla at all, so it cannot affect the vehicle. */
export const PASSIVE_POLLING_POLICY: Record<VehiclePresence, PollingRule> = Object.fromEntries(
  (Object.keys(DEFAULT_POLLING_POLICY) as VehiclePresence[]).map((presence) => [
    presence,
    { cacheMs: Number.MAX_SAFE_INTEGER, liveMs: Number.MAX_SAFE_INTEGER, probeAllowed: false, wakeAllowed: false },
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
 * Resolves the effective profile from the two columns that can set it.
 *
 * `polling_profile` (migration 004) is the new, explicit control. `collection_mode`
 * is the legacy MVP column, and its `passive` value genuinely means "make no Tesla
 * requests at all" — the dashboard then reads the database only, exactly as the
 * original README promised. Mapping it through a fallthrough would have silently
 * downgraded a user's deliberate choice, so the three cases are named.
 */
export function resolvePollingProfile(input: { pollingProfile?: string | null; collectionMode?: string | null }): PollingProfile {
  if (input.pollingProfile && input.pollingProfile in POLLING_PROFILES) return input.pollingProfile as PollingProfile
  switch (input.collectionMode) {
    case 'passive':
      return 'passive'
    case 'on_demand':
      return 'relaxed'
    case 'conservative':
    default:
      return 'default'
  }
}

/**
 * Decides whether a read may reach Tesla, from the age of the newest snapshot.
 * Exported for tests: this is the single gate that keeps a dashboard reload from
 * becoming a polling loop (AGENTS.md §3.2 step 2).
 *
 * Note what this does NOT decide: whether telemetry is fetched. The client only
 * calls `vehicle_data` after the probe reports `online`, so an asleep vehicle is
 * protected structurally rather than by a second guess here. `presence === null`
 * (never collected) must still be allowed one probe, otherwise a fresh install can
 * never bootstrap itself into having data.
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
  if (!rule.probeAllowed) {
    return { collect: false, reason: input.presence === 'sleeping' ? 'vehicle_sleeping' : 'passive_mode_no_requests' }
  }
  if (!input.force && input.snapshotAgeMs !== null && input.snapshotAgeMs < rule.cacheMs) {
    return { collect: false, reason: 'fresh_cache' }
  }
  if (!input.force && input.snapshotAgeMs !== null && input.snapshotAgeMs < rule.liveMs) {
    return { collect: false, reason: 'within_live_interval' }
  }
  if (input.force && input.presence === 'sleeping' && !input.mayWake) {
    return { collect: false, reason: 'wake_confirmation_required' }
  }
  return { collect: true, reason: input.force ? 'user_requested' : input.presence === null ? 'first_collect' : 'policy_allowed' }
}
