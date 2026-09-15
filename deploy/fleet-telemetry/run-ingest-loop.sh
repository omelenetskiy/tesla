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

  container_id="$(docker-compose -f "$COMPOSE_FILE" ps -q "$SERVICE")"
  if [[ -n "$container_id" ]]; then
    docker logs --since="$since" --until="$now" --timestamps "$container_id" 2>&1 \
      | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[^ ]+ //' \
      | node --env-file=.env --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register.mjs ./scripts/ingest-fleet-telemetry.mts --stdin
  fi

  printf '%s\n' "$now" > "$CURSOR_FILE"
  sleep "$POLL_SECONDS"
done

