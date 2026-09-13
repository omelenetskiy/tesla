/**
 * Register the application's public key with Tesla.
 *
 *   node --env-file=.env --import ./scripts/register.mjs \
 *     deploy/fleet-telemetry/register-partner.mts [--domain=…] [--dry-run]
 *
 * Order matters, and this script enforces it by checking before it posts: Tesla fetches
 * `https://<domain>/.well-known/appspecific/com.tesla.3p.public-key.pem` during registration,
 * so a domain that does not yet serve the key registers successfully and then fails every
 * signed call. Verifying the served bytes match the local key is what catches a stale
 * `public.pem` sitting next to a rotated private key.
 */
import { createFleetConfig } from '@/lib/fleet/config'
import { requestPartnerToken } from '@/lib/fleet/auth'
import { FleetClient } from '@/lib/fleet/client'
import { PUBLIC_KEY_WELL_KNOWN_PATH, fingerprint, loadPrivateKey, publicKeyPemFromPrivate } from '@/lib/fleet/keys'

function flag(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (hit) return hit.slice(name.length + 3)
  return process.argv.includes(`--${name}`) ? '' : fallback
}

async function main() {
  const config = createFleetConfig({
    region: process.env.TESLA_FLEET_REGION,
    clientId: process.env.TESLA_FLEET_CLIENT_ID,
    clientSecret: process.env.TESLA_FLEET_CLIENT_SECRET,
    redirectUri: process.env.TESLA_FLEET_REDIRECT_URI,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    scopeOverride: process.env.TESLA_FLEET_SCOPES,
  })

  const domain = flag('domain') ?? new URL(config.redirectUri).hostname
  const dryRun = process.argv.includes('--dry-run')
  const url = `https://${domain}${PUBLIC_KEY_WELL_KNOWN_PATH}`

  const localPem = publicKeyPemFromPrivate(loadPrivateKey())
  console.log(`domain        ${domain}`)
  console.log(`fleet api     ${config.apiBaseUrl}`)
  console.log(`key url       ${url}`)
  console.log(`local key     sha256:${fingerprint(localPem).slice(0, 16)}…`)

  let served: string | null = null
  try {
    const response = await fetch(url, { headers: { accept: 'application/x-pem-file' }, cache: 'no-store' })
    served = response.ok ? await response.text() : `HTTP ${response.status}`
  } catch (error) {
    served = `unreachable: ${error instanceof Error ? error.message : 'unknown'}`
  }

  if (served.startsWith('HTTP') || served.startsWith('unreachable')) {
    console.error(`\nthe public key is not reachable: ${served}`)
    console.error('registering now would succeed and every later signed call would fail. Fix the')
    console.error('deployment first: the app must be reachable over HTTPS on this exact host and path.')
    process.exit(1)
  }
  if (fingerprint(served) !== fingerprint(localPem)) {
    console.error('\nthe served key does not match the local private key.')
    console.error(`served sha256:${fingerprint(served).slice(0, 16)}…  local sha256:${fingerprint(localPem).slice(0, 16)}…`)
    console.error('usually a stale public.pem, or the domain pointing at a different deployment.')
    process.exit(1)
  }
  console.log('served key    matches the local private key ✓')

  if (dryRun) {
    console.log('\n--dry-run, nothing was sent to Tesla.')
    return
  }

  const partner = await requestPartnerToken(config)
  const client = new FleetClient({
    config,
    // The partner token is a plain bearer here; no refresh chain, because nothing
    // concurrent is competing for a rotating refresh token in this flow.
    getAccessToken: async () => partner.access_token,
    refreshAccessToken: async () => (await requestPartnerToken(config)).access_token,
  })

  const result = await client.request<{ response?: unknown } | Record<string, unknown>>('/api/1/partner_accounts', {
    method: 'POST',
    body: { domain },
    requestType: 'telemetry_config',
  })
  console.log('register ->', JSON.stringify(result ?? {}))
  console.log('\nnext: install the key on the car — open')
  console.log(`  https://tesla.com/_ak/${domain}`)
  console.log('while signed in as a trusted user, then accept on the vehicle screen.')
  console.log('Confirm with: configure-vehicle.mts (it reports key_paired before it posts).')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
