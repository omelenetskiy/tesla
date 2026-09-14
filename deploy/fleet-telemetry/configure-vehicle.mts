/**
 * Configure the car to stream to your receiver, and read the result back.
 *
 *   node --env-file=.env --import ./scripts/register.mjs \
 *     deploy/fleet-telemetry/configure-vehicle.mts --dry-run
 *   node --env-file=.env --import ./scripts/register.mjs \
 *     deploy/fleet-telemetry/configure-vehicle.mts --hostname=telemetry.example.com
 *
 * Flags: --hostname --port --ca-file --vin --fields=<file.json> --dry-run
 *
 * It reuses the app's own client and token store rather than talking to Tesla by hand, so the
 * access token is decrypted and refreshed by exactly the code the product uses.
 */
import { readFileSync } from 'node:fs'
import { getSupabaseAdmin } from '@/lib/supabase'
import { fleetConfig } from '@/lib/fleet/config'
import { FleetClient } from '@/lib/fleet/client'
import { createFleetAccessTokenProvider, refreshFleetCredential } from '@/lib/fleet/tokens'

function flag(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (hit) return hit.slice(name.length + 3)
  return process.argv.includes(`--${name}`) ? '' : fallback
}

/**
 * Field set for the dashboard: state, position, charge and health.
 *
 * Names are the proto `Field` spellings, not the intuitive ones - there is no `Speed`,
 * `Heading` or `Power`; the real names are `VehicleSpeed`, `GpsHeading`, and per-kind power
 * fields. `PackVoltage`/`PackCurrent` do exist. An unknown name is rejected by the API, and
 * the whole config with it, so this list is the contract.
 */
const DEFAULT_FIELDS = {
  VehicleSpeed: { interval_seconds: 5 },
  Location: { interval_seconds: 5, include_fields: ['GpsHeading'] },
  Odometer: { interval_seconds: 60 },
  Soc: { interval_seconds: 60 },
  EstBatteryRange: { interval_seconds: 60 },
  IdealBatteryRange: { interval_seconds: 60 },
  Gear: { interval_seconds: 5 },
  DetailedChargeState: { interval_seconds: 5 },
  ChargerVoltage: { interval_seconds: 5 },
  ChargeAmps: { interval_seconds: 5 },
  PackVoltage: { interval_seconds: 5 },
  PackCurrent: { interval_seconds: 5 },
  InsideTemp: { interval_seconds: 60 },
  OutsideTemp: { interval_seconds: 60 },
  DoorState: { interval_seconds: 30 },
  Locked: { interval_seconds: 30 },
  ChargePortDoorOpen: { interval_seconds: 30 },
  TpmsPressureFl: { interval_seconds: 300 },
  TpmsPressureFr: { interval_seconds: 300 },
  TpmsPressureRl: { interval_seconds: 300 },
  TpmsPressureRr: { interval_seconds: 300 },
}

async function main() {
  const config = fleetConfig()
  const supabase = getSupabaseAdmin()

  const { data: credRow, error: credError } = await supabase.from('fleet_credentials').select('owner_id').limit(1).maybeSingle()
  if (credError) throw new Error(`fleet_credentials unreadable (apply 007_fleet_credentials.sql): ${credError.message}`)
  if (!credRow) throw new Error('No Fleet authorization stored. Connect the Tesla account in Settings first.')
  const ownerId = credRow.owner_id as string

  const wanted = flag('vin')
  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('vin, display_name')
    .eq('owner_id', ownerId)
    .not('vin', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (vehicleError) throw new Error(`vehicles unreadable: ${vehicleError.message}`)
  const vin = wanted ?? vehicle?.vin
  if (!vin) throw new Error('No VIN on file - run the app once so the vehicle list syncs, or pass --vin=...')

  const hostname = flag('hostname')
  const portRaw = flag('port', '443') ?? '443'
  const caFile = flag('ca-file', 'certs/fullchain.pem') ?? 'certs/fullchain.pem'
  const dryRun = process.argv.includes('--dry-run')

  if (!dryRun && !hostname) throw new Error('--hostname is required (or use --dry-run). It must share the root domain of the registered app.')

  let fields: unknown = DEFAULT_FIELDS
  const fieldsFile = flag('fields')
  if (fieldsFile) fields = JSON.parse(readFileSync(fieldsFile, 'utf8'))

  const ca = readFileSync(caFile, 'utf8')
  const body = {
    vins: [vin],
    config: {
      hostname: hostname || 'telemetry.example.com',
      port: Number(portRaw),
      ca,
      fields,
      alert_types: ['service', 'customer'],
      delivery_policy: 'latest',
    },
  }

  console.log(`vin        ${vin}${vehicle?.display_name ? ` (${vehicle.display_name})` : ''}`)
  console.log(`region     ${config.region} -> ${config.apiBaseUrl}`)
  console.log(`proxy      ${config.commandProxyUrl ?? 'direct Fleet API'}`)
  console.log(`hostname   ${body.config.hostname}:${body.config.port}`)
  console.log(`ca         ${caFile} (${ca.length} bytes)`)
  console.log(`fields     ${Object.keys(fields as object).length} signals`)

  if (!dryRun && !config.commandProxyUrl) {
    throw new Error('TESLA_HTTP_PROXY_URL is required for fleet_telemetry_config. Start the vehicle-command proxy and set TESLA_HTTP_PROXY_URL before running this script.')
  }

  if (dryRun) {
    console.log('\n--dry-run, nothing was sent. Body without the certificate:')
    console.log(JSON.stringify({ ...body, config: { ...body.config, ca: '<pem>' } }, null, 2))
    return
  }

  const client = new FleetClient({
    config,
    getAccessToken: createFleetAccessTokenProvider(ownerId),
    refreshAccessToken: () => refreshFleetCredential(ownerId),
  })

  /*
   * Ask the car about the key before spending a config write on it.
   *
   * `missing_key` in the create response tells you it failed but not what to do, and the
   * pairing is the step people skip: without the app's public key installed on the vehicle,
   * the vehicle rejects the telemetry configuration exactly as it rejects commands. This call
   * is cheap, needs no wake, and names the VIN.
   */
  const status = await client
    .request<{ key_paired_vins?: string[]; unpaired_vins?: string[]; vehicle_info?: Record<string, { fleet_telemetry_version?: string; firmware_version?: string }> }>(
      '/api/1/vehicles/fleet_status',
      { method: 'POST', body: { vins: [vin] }, requestType: 'telemetry_config' },
    )
    .catch((error) => {
      console.warn(`fleet_status unavailable (${error instanceof Error ? error.message : 'unknown'}) - continuing without the pre-check.`)
      return null
    })
  if (status) {
    const info = status.vehicle_info?.[vin]
    const paired = status.key_paired_vins?.includes(vin)
    console.log(`key paired   ${paired ? 'yes' : 'NO'}${info?.firmware_version ? `  firmware ${info.firmware_version}` : ''}${info?.fleet_telemetry_version ? `  telemetry client ${info.fleet_telemetry_version}` : ''}`)
    if (!paired) {
      console.error('\nThe app key is not installed on this vehicle, so the config will be rejected with')
      console.error('skipped_vehicles.missing_key. Do this first:')
      console.error('  1. deploy/fleet-telemetry/make-key.sh')
      console.error('  2. deploy/fleet-telemetry/register-partner.mts')
      console.error('  3. open https://tesla.com/_ak/<app-domain> as a trusted user and accept on the car')
      console.error('\nRe-run afterwards, or pass --force to post anyway.')
      if (!process.argv.includes('--force')) process.exit(1)
    }
  }

  const created = await client.request<{ updated_vehicles?: number; skipped_vehicles?: Record<string, string[]> }>('/api/1/vehicles/fleet_telemetry_config', {
    method: 'POST',
    body,
    requestType: 'telemetry_config',
  })
  console.log('\ncreate ->', JSON.stringify(created))
  const skipped = created?.skipped_vehicles ?? {}
  for (const [reason, vins] of Object.entries(skipped)) {
    if ((vins ?? []).length) console.warn(`  skipped (${reason}): ${vins.join(', ')}`)
  }
  // missing_key is the virtual key not being installed on the car; unsupported_firmware is
  // the fleet client version being too old. Neither is fixable from here.

  const read = await client.request<{ synced?: boolean; key_paired?: boolean; limit_reached?: boolean; config?: { hostname?: string; port?: number } }>(
    `/api/1/vehicles/${encodeURIComponent(vin)}/fleet_telemetry_config`,
    { requestType: 'telemetry_config' },
  )
  console.log('get    ->', JSON.stringify(read))
  if (read?.synced === false) {
    console.log('\nsynced=false is normal: the car adopts the config the next time it establishes a backend')
    console.log('connection, so a parked vehicle can sit on it for hours. Drive it once, then re-run this.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
