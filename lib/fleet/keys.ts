import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * The application's virtual key.
 *
 * Tesla's docs use "virtual key" for two different things, and mixing them up is the usual
 * way this setup fails quietly:
 *
 *  - the **application key pair** — an EC key on `prime256v1` (secp256r1). The public half is
 *    published at `/.well-known/appspecific/com.tesla.3p.public-key.pem` on the app's domain
 *    and registered with Tesla; the private half stays on this server. "Before executing a
 *    command or accepting a Fleet Telemetry configuration, the vehicle ensures the payload is
 *    signed by a private key whose public key is present on the vehicle."
 *  - the **car's own keys** (phone key, key card), which are unrelated to this API.
 *
 * Only the public half is ever served, and it is derived from the private key at request time
 * rather than read from a second file: a `public.pem` checked in next to a rotated
 * `private.pem` produces a key Tesla accepts and a car that rejects every command.
 */

/** Path Tesla fetches, relative to the application's registered domain. */
export const PUBLIC_KEY_WELL_KNOWN_PATH = '/.well-known/appspecific/com.tesla.3p.public-key.pem'

const PUBLIC_PEM_MARKER = '-----BEGIN PUBLIC KEY-----'

export class FleetKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FleetKeyError'
  }
}

export function privateKeyPath(): string {
  const raw = (process.env.TESLA_FLEET_PRIVATE_KEY_PATH ?? '').trim()
  if (!raw) {
    throw new FleetKeyError(`TESLA_FLEET_PRIVATE_KEY_PATH is not set. Create the pair with deploy/fleet-telemetry/make-key.sh, then point this variable at keys/private.pem — and keep keys/ out of git.`)
  }
  return raw
}

/** Reads the private key and asserts the curve Tesla requires, failing loudly otherwise. */
export function loadPrivateKey(path = privateKeyPath()): crypto.KeyObject {
  let pem: string
  try {
    pem = readFileSync(path, 'utf8')
  } catch {
    throw new FleetKeyError(`Could not read the private key at "${path}".`)
  }
  let key: crypto.KeyObject
  try {
    key = crypto.createPrivateKey({ key: pem, format: 'pem' })
  } catch {
    throw new FleetKeyError(`The file at "${path}" is not a PEM private key. Expected the output of "openssl ecparam -name prime256v1 -genkey".`)
  }
  const curve = key.asymmetricKeyDetails?.namedCurve
  if (curve !== 'prime256v1') {
    // secp384r1 and secp521r1 are valid EC keys that Tesla will simply never accept, and the
    // rejection surfaces as a command error far away from the cause.
    throw new FleetKeyError(`The key uses curve "${curve ?? 'unknown'}"; Tesla requires prime256v1 (secp256r1). Regenerate with deploy/fleet-telemetry/make-key.sh.`)
  }
  return key
}

/** SubjectPublicKeyInfo PEM — the same bytes `openssl ec -pubout` writes. */
export function publicKeyPemFromPrivate(key: crypto.KeyObject): string {
  // `spki` is a *public* key type; exporting it straight off a private KeyObject throws
  // ERR_INVALID_ARG_VALUE. The public half has to be derived first.
  const pem = crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString()
  if (!pem.includes(PUBLIC_PEM_MARKER)) throw new FleetKeyError('Derived public key is not a SubjectPublicKeyInfo PEM.')
  return pem
}

export function fingerprint(pem: string): string {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return crypto.createHash('sha256').update(Buffer.from(body, 'base64')).digest('hex')
}

/**
 * Second-level + first-level domain, which is what Tesla compares the telemetry `hostname`
 * against: "must match the root domain (second-level + first-level domain) of the registered
 * application".
 *
 * Deliberately naive about multi-part public suffixes (`co.uk` and friends) — it is used to
 * warn about an obvious mismatch, not to arbitrate a public-suffix list.
 */
export function rootDomain(input: string): string {
  let host = input
  try {
    host = new URL(input.includes('://') ? input : `https://${input}`).hostname
  } catch {
    host = input
  }
  const labels = host.split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')
  return labels.slice(-2).join('.')
}

/** The pairing check: does this telemetry host live under the app's registered root domain? */
export function hostnameMatchesAppDomain(telemetryHost: string, appUrl: string): boolean {
  return rootDomain(telemetryHost) === rootDomain(appUrl)
}
