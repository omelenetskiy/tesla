/**
 * The one rule that decides which identifier goes into an Owner API path.
 *
 * Plan E2/E3 named this as the single most damaging confusion in the old
 * implementation, and it survived the rewrite in `ownerApiIdOf`: a row whose short id
 * was never recorded fell through to the long `vehicle_id`, so every request went to
 * `/api/1/vehicles/3744651726645272`. Tesla rejects that, which looks exactly like a
 * dead credential — a dashboard with no data even while SSO accepted the token.
 *
 * A missing short id is therefore reported as missing, never guessed. `null` means the
 * caller must run `GET /api/1/vehicles`, which is the only request that yields it and
 * which needs no id itself.
 */

export type VehicleIdColumns = {
  owner_api_id?: string | null
  provider_vehicle_id?: string | null
  vehicle_id?: string | null
}

/** Owner API short ids are at most 12 digits; the streaming `vehicle_id` is 16. */
const MAX_SHORT_ID_LENGTH = 12

export function resolveOwnerApiId(row: VehicleIdColumns): string | null {
  const stored = row.owner_api_id?.trim()
  if (stored) return stored

  // The legacy column holds whatever an older connect wrote, which for some rows is
  // the long id. Only accept it when its shape proves it is the short one.
  const legacy = row.provider_vehicle_id?.trim() ?? ''
  if (legacy && legacy.length <= MAX_SHORT_ID_LENGTH) return legacy

  return null
}
