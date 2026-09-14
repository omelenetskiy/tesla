#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/fleet-telemetry/docker-compose.sni-router.yml}"
SERVICE="${SERVICE:-fleet-telemetry}"
POLL_SECONDS="${POLL_SECONDS:-15}"
TAIL_LINES="${TAIL_LINES:-200}"

cd "$ROOT_DIR"

while true; do
  docker-compose -f "$COMPOSE_FILE" logs --tail="$TAIL_LINES" --no-log-prefix "$SERVICE" \
    | node --env-file=.env --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register.mjs ./scripts/ingest-fleet-telemetry.mts --stdin
  sleep "$POLL_SECONDS"
done

