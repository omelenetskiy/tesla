import type { VehiclePresence, VehicleStatusSnapshot } from './models'

/**
 * Legacy polling policy module kept for compatibility while Owner API code paths are
 * still present in `lib/tesla/service.ts` and debug tooling.
 */
export interface VehicleDataProvider {
  read(): Promise<VehicleStatusSnapshot>
  refresh(options?: { mayWake?: boolean }): Promise<VehicleStatusSnapshot>
  subscribe?(listener: (snapshot: VehicleStatusSnapshot) => void): () => void
  describe(): ProviderDescriptor
}

export type ProviderDescriptor = {
  kind: 'polling' | 'streaming'
  policy: Record<VehiclePresence, PollingRule>
  configurable: boolean
}

export type PollingRule = {
  cacheMs: number
  liveMs: number
  probeAllowed: boolean
  wakeAllowed: boolean
}

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

