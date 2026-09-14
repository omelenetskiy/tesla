#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { applyTelemetryRecord, emptyVehicleStatus, FleetTelemetryIngester, parseTelemetryLogLine } from '@/lib/fleet/telemetry-ingest'

function flag(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (hit) return hit.slice(name.length + 3)
  return process.argv.includes(`--${name}`) ? '' : fallback
}

const useStdin = process.argv.includes('--stdin') || !process.stdin.isTTY
const composeFile = flag('compose-file', 'deploy/fleet-telemetry/docker-compose.sni-router.yml') ?? 'deploy/fleet-telemetry/docker-compose.sni-router.yml'
const composeBin = flag('compose-bin', 'docker-compose') ?? 'docker-compose'
const service = flag('service', 'fleet-telemetry') ?? 'fleet-telemetry'
const dryRun = process.argv.includes('--dry-run')
const cwd = resolve(process.cwd())

async function main() {
  const ingester = new FleetTelemetryIngester()
  if (!dryRun) await ingester.refreshVehicles()

  const stats = { ingested: 0, duplicates: 0, unknownVehicles: 0, ignored: 0 }

  async function handleLine(line: string) {
    if (dryRun) {
      const record = parseTelemetryLogLine(line)
      if (!record) {
        stats.ignored += 1
        return
      }
      const vin = record.vin ?? record.metadata?.vin ?? String(record.data?.Vin ?? '')
      const base = emptyVehicleStatus({ id: 'dry-run', display_name: 'Dry run', vehicle_tag_id: null, vehicle_id: null, vin })
      const applied = applyTelemetryRecord(base, record)
      stats.ingested += 1
      console.log(JSON.stringify({ vin, collectedAt: applied.collectedAt, fields: applied.fields, mappedFields: applied.mappedFields }, null, 2))
      return
    }

    const result = await ingester.ingestLine(line)
    switch (result.kind) {
      case 'ignored':
        stats.ignored += 1
        break
      case 'duplicate':
        stats.duplicates += 1
        break
      case 'unknown_vehicle':
        stats.unknownVehicles += 1
        console.warn(`[telemetry] skipped unknown VIN ${result.vin}`)
        break
      case 'ingested':
        stats.ingested += 1
        console.log(`[telemetry] ${result.vin} ${result.fields.join(',') || 'raw'} @ ${result.collectedAt}${result.mappedFields.length ? ` -> ${result.mappedFields.join(',')}` : ' -> raw-only'}`)
        break
    }
  }

  async function processStream(input: NodeJS.ReadableStream) {
    const rl = createInterface({ input, crlfDelay: Infinity })
    for await (const line of rl) {
      await handleLine(line)
    }
  }

  function printSummary() {
    console.log(`\n[telemetry] summary ingested=${stats.ingested} duplicate=${stats.duplicates} unknown_vehicle=${stats.unknownVehicles} ignored=${stats.ignored}`)
  }

  process.on('SIGINT', () => {
    printSummary()
    process.exit(0)
  })

  if (useStdin) {
    await processStream(process.stdin)
    printSummary()
    return
  }

  const args = composeBin === 'docker'
    ? ['compose', '-f', composeFile, 'logs', '-f', '--no-log-prefix', service]
    : ['-f', composeFile, 'logs', '-f', '--no-log-prefix', service]
  const child = spawn(composeBin, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] })
  child.on('error', (error) => {
    console.error(`[telemetry] could not start ${composeBin}: ${error.message}`)
    process.exit(1)
  })
  await processStream(child.stdout)
  printSummary()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

