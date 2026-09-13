/**
 * The one rule that decides which identifier goes into a Fleet path.
 *
 * A missing vehicle tag is reported as missing, never guessed. `null` means the
 * caller must run `GET /api/1/vehicles`, which is the only request that yields it and
 * which needs no id itself.
 */

export type VehicleIdColumns = {
  vehicle_tag_id?: string | null
}

export function resolveVehicleTagId(row: VehicleIdColumns): string | null {
  const stored = row.vehicle_tag_id?.trim()
  return stored || null
}
