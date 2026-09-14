#!/usr/bin/env node
/**
 * Copy the generated Tesla public key into the deployable .well-known location.
 *
 * This makes the app-domain public key publishable by the normal Next.js/Netlify
 * static pipeline without hand-copying files.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'deploy/fleet-telemetry/keys/public.pem')
const target = resolve(root, 'public/.well-known/appspecific/com.tesla.3p.public-key.pem')

function fingerprint(pem: string) {
  const normalized = pem.trim().replace(/\r\n/g, '\n') + '\n'
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

async function main() {
  const sourcePem = await readFile(source, 'utf8')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, sourcePem.endsWith('\n') ? sourcePem : `${sourcePem}\n`)

  const targetPem = await readFile(target, 'utf8')
  const ok = fingerprint(sourcePem) === fingerprint(targetPem)

  console.log(`source: ${source}`)
  console.log(`target: ${target}`)
  console.log(`sha256: ${fingerprint(targetPem).slice(0, 16)}…`)

  if (!ok) {
    throw new Error('synchronized key does not match source key')
  }

  console.log('Tesla public key synchronized to public/.well-known ✓')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

