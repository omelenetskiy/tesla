#!/usr/bin/env node

import { getSupabaseAdmin } from '@/lib/supabase'
import { persistDerivedHistory, readHistory } from '@/lib/tesla/history'

async function main() {
  const supabase = getSupabaseAdmin()
  const { data: vehicles, error } = await supabase.from('vehicles').select('id, owner_id, vin, display_name')
  if (error) throw new Error(`Failed to load vehicles: ${error.message}`)

  if (!vehicles?.length) {
    console.log('[history-backfill] no vehicles found')
    return
  }

  for (const vehicle of vehicles) {
    const bundle = await readHistory(vehicle.id, 'all')
    const report = await persistDerivedHistory({
      vehicleId: vehicle.id,
      ownerId: vehicle.owner_id,
      bundle,
    })

    console.log(
      JSON.stringify(
        {
          vin: vehicle.vin,
          name: vehicle.display_name,
          vehicleId: vehicle.id,
          origin: bundle.origin,
          snapshotCount: bundle.snapshotCount,
          derived: {
            trips: bundle.trips.length,
            charging: bundle.charging.length,
            battery: bundle.battery.length,
          },
          persisted: report,
        },
        null,
        2,
      ),
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

