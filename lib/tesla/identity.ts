/**
 * The one rule that decides which identifier goes into a Fleet path.
 *
 * A missing vehicle tag is reported as missing, never guessed. `null` means the
 * caller must run `GET /api/1/vehicles`, which is the only request that yields it and
 * which needs no id itself.
 */

export type VehicleIdColumns = {
  vehicle_tag_id?: string | null
  provider_vehicle_id?: string | null
  vehicle_id?: string | null
}

function isShortVehicleTagId(value: string): boolean {
  return /^\d{1,15}$/.test(value.trim())
}

export function resolveVehicleTagId(row: VehicleIdColumns): string | null {
  const stored = row.vehicle_tag_id?.trim()
  if (stored) return stored

  const provider = row.provider_vehicle_id?.trim()
  if (provider && isShortVehicleTagId(provider) && provider !== row.vehicle_id?.trim()) {
    return provider
  }

  return null
}
