#!/usr/bin/env node
/**
 * Quick deployment readiness check for DriveScope.
 *
 * This does not talk to Tesla or any remote services. It only validates the local
 * files that must exist before the web app and telemetry receiver can work:
 * - the Tesla virtual key pair
 * - the published .well-known public key
 * - the telemetry TLS cert files expected by docker-compose
 * - the telemetry config paths that point to those certs
 */

import { existsSync, readFileSync } from 'node:fs'
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicKeyPath = resolve(root, 'public/.well-known/appspecific/com.tesla.3p.public-key.pem')
const privateKeyPath = resolve(root, 'deploy/fleet-telemetry/keys/private.pem')
const generatedPublicKeyPath = resolve(root, 'deploy/fleet-telemetry/keys/public.pem')
const telemetryConfigPath = resolve(root, 'deploy/fleet-telemetry/config.local.json')
const telemetryCertDir = resolve(root, 'deploy/fleet-telemetry/certs')
const serverCertPath = resolve(telemetryCertDir, 'fullchain.pem')
const serverKeyPath = resolve(telemetryCertDir, 'privkey.pem')

function status(ok: boolean, label: string, detail = '') {
  const mark = ok ? '✓' : '✗'
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`)
}

function fingerprint(pem: string) {
  const normalized = pem.trim().replace(/\r\n/g, '\n') + '\n'
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

let failed = false
function requireFile(path: string, label: string) {
  const ok = existsSync(path)
  status(ok, label, ok ? path : 'missing')
  if (!ok) failed = true
  return ok
}

console.log('DriveScope deployment readiness')
console.log(`root: ${root}`)
console.log('')

const privateExists = requireFile(privateKeyPath, 'Tesla application private key')
const publicExists = requireFile(generatedPublicKeyPath, 'Generated Tesla public key')
const wellKnownExists = requireFile(publicKeyPath, 'Published .well-known public key')
const configExists = requireFile(telemetryConfigPath, 'Telemetry receiver config')
requireFile(telemetryCertDir, 'Telemetry certificate directory')
const serverCertExists = requireFile(serverCertPath, 'Telemetry server certificate chain')
const serverKeyExists = requireFile(serverKeyPath, 'Telemetry server private key')

if (privateExists && publicExists && wellKnownExists) {
  try {
    const privatePem = readFileSync(privateKeyPath, 'utf8')
    const localPublicPem = readFileSync(generatedPublicKeyPath, 'utf8')
    const publishedPublicPem = readFileSync(publicKeyPath, 'utf8')
    const derivedPublicPem = createPublicKey(createPrivateKey(privatePem)).export({ format: 'pem', type: 'spki' }).toString()

    const localMatchesPrivate = fingerprint(localPublicPem) === fingerprint(derivedPublicPem)
    const publishedMatchesPrivate = fingerprint(publishedPublicPem) === fingerprint(derivedPublicPem)

    status(localMatchesPrivate, 'Generated public key matches private key', localMatchesPrivate ? 'ok' : 'mismatch')
    status(publishedMatchesPrivate, 'Published .well-known key matches private key', publishedMatchesPrivate ? 'ok' : 'mismatch')
    if (!localMatchesPrivate || !publishedMatchesPrivate) failed = true
  } catch (error) {
    failed = true
    status(false, 'Key pair validation', error instanceof Error ? error.message : 'unknown error')
  }
}

if (configExists) {
  try {
    const config = JSON.parse(readFileSync(telemetryConfigPath, 'utf8')) as { tls?: { server_cert?: string; server_key?: string } }
    const certOk = config.tls?.server_cert === '/etc/fleet-telemetry/certs/fullchain.pem'
    const keyOk = config.tls?.server_key === '/etc/fleet-telemetry/certs/privkey.pem'
    status(certOk, 'Telemetry config server_cert path', config.tls?.server_cert ?? 'missing')
    status(keyOk, 'Telemetry config server_key path', config.tls?.server_key ?? 'missing')
    if (!certOk || !keyOk) failed = true
  } catch (error) {
    failed = true
    status(false, 'Telemetry config parse', error instanceof Error ? error.message : 'unknown error')
  }
}

console.log('')
console.log('Next required actions:')
if (!serverCertExists || !serverKeyExists) {
  console.log('- issue a publicly trusted TLS certificate for the telemetry host (`deploy/fleet-telemetry/issue-cert.sh`)')
}
if (!wellKnownExists || !publicExists || !privateExists) {
  console.log('- generate or restore the Tesla virtual key pair (`deploy/fleet-telemetry/make-key.sh`)')
}
console.log('- deploy the web app so `https://<your-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem` is reachable')
console.log('- register the partner account with Tesla and pair the key on the vehicle')
console.log('- start the telemetry receiver with `docker compose up -d` in `deploy/fleet-telemetry/`')
console.log('- configure the vehicle telemetry target with `configure-vehicle.mts` after the car is online')

if (!failed) {
  console.log('\nAll local deployment files look ready.')
} else {
  console.log('\nSome required deployment files are missing or mismatched.')
  process.exitCode = 1
}


