#!/usr/bin/env bash
set -euo pipefail

: "${APP_HOST:?set APP_HOST, e.g. app.omelenetskiy.xyz}"
: "${TELEMETRY_HOST:?set TELEMETRY_HOST, e.g. telemetry.omelenetskiy.xyz}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_CERT="${APP_CERT:-/etc/letsencrypt/live/${APP_HOST}/fullchain.pem}"
APP_KEY="${APP_KEY:-/etc/letsencrypt/live/${APP_HOST}/privkey.pem}"
PUBLIC_KEY_FILE="${PUBLIC_KEY_FILE:-/home/ubuntu/TeslaApp/public/.well-known/appspecific/com.tesla.3p.public-key.pem}"
STAGED_PUBLIC_KEY_DIR="/var/www/tesla-public-key"
STAGED_PUBLIC_KEY_FILE="${STAGED_PUBLIC_KEY_DIR}/com.tesla.3p.public-key.pem"
UPSTREAM_ORIGIN="${UPSTREAM_ORIGIN:-https://tesla-y-dashboard.netlify.app}"
UPSTREAM_HOST="${UPSTREAM_HOST:-tesla-y-dashboard.netlify.app}"
NGINX_CONF="/etc/nginx/nginx.conf"
STREAMS_DIR="/etc/nginx/streams-enabled"
APP_SITE="/etc/nginx/sites-available/${APP_HOST}.conf"
APP_SITE_LINK="/etc/nginx/sites-enabled/${APP_HOST}.conf"
STREAM_CONF="${STREAMS_DIR}/tesla-sni-router.conf"

sudo test -f "$APP_CERT"
sudo test -f "$APP_KEY"
sudo test -f "$PUBLIC_KEY_FILE"

sudo mkdir -p "$STAGED_PUBLIC_KEY_DIR"
sudo cp "$PUBLIC_KEY_FILE" "$STAGED_PUBLIC_KEY_FILE"
sudo chmod 644 "$STAGED_PUBLIC_KEY_FILE"

sudo mkdir -p "$STREAMS_DIR"

if ! sudo grep -q 'include /etc/nginx/streams-enabled/\*;' "$NGINX_CONF"; then
  sudo cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%s)"
  sudo python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/nginx.conf')
text = p.read_text()
needle = "include /etc/nginx/sites-enabled/*;\n}\n"
replacement = "include /etc/nginx/sites-enabled/*;\n}\n\nstream {\n    include /etc/nginx/streams-enabled/*;\n}\n"
if 'include /etc/nginx/streams-enabled/*;' not in text:
    if needle not in text:
        raise SystemExit('Could not find insertion point in nginx.conf')
    text = text.replace(needle, replacement, 1)
    p.write_text(text)
PY
fi

sed \
  -e "s|__APP_HOST__|${APP_HOST}|g" \
  -e "s|__APP_CERT__|${APP_CERT}|g" \
  -e "s|__APP_KEY__|${APP_KEY}|g" \
  -e "s|__PUBLIC_KEY_FILE__|${STAGED_PUBLIC_KEY_FILE}|g" \
  -e "s|__UPSTREAM_ORIGIN__|${UPSTREAM_ORIGIN}|g" \
  -e "s|__UPSTREAM_HOST__|${UPSTREAM_HOST}|g" \
  "$ROOT_DIR/nginx-app-proxy.conf.template" | sudo tee "$APP_SITE" >/dev/null

sed \
  -e "s|__APP_HOST__|${APP_HOST}|g" \
  -e "s|__TELEMETRY_HOST__|${TELEMETRY_HOST}|g" \
  "$ROOT_DIR/nginx-stream-router.conf.template" | sudo tee "$STREAM_CONF" >/dev/null

sudo ln -sfn "$APP_SITE" "$APP_SITE_LINK"
sudo nginx -t
sudo systemctl reload nginx

echo "Installed app proxy site: $APP_SITE"
echo "Installed stream router:  $STREAM_CONF"
echo "Next switch telemetry to the router-aware compose file:"
echo "  cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry"
echo "  docker-compose -f docker-compose.sni-router.yml up -d"


