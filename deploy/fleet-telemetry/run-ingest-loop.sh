#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/fleet-telemetry/docker-compose.sni-router.yml}"
SERVICE="${SERVICE:-fleet-telemetry}"
POLL_SECONDS="${POLL_SECONDS:-15}"
CURSOR_FILE="${CURSOR_FILE:-}"
OVERLAP_SECONDS="${OVERLAP_SECONDS:-30}"

cd "$ROOT_DIR"
CURSOR_FILE="${CURSOR_FILE:-$ROOT_DIR/.fleet-telemetry/ingest-cursor.utc}"
mkdir -p "$(dirname "$CURSOR_FILE")"

while true; do
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if [[ -s "$CURSOR_FILE" ]]; then
    since="$(cat "$CURSOR_FILE")"
  else
    since="$(date -u -v-30S +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 seconds ago' +%Y-%m-%dT%H:%M:%SZ)"
  fi

  docker-compose -f "$COMPOSE_FILE" logs --since="$since" --until="$now" --no-log-prefix "$SERVICE" \
    | node --env-file=.env --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register.mjs ./scripts/ingest-fleet-telemetry.mts --stdin

  printf '%s\n' "$now" > "$CURSOR_FILE"
  sleep "$POLL_SECONDS"
done

