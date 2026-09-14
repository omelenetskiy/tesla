#!/usr/bin/env bash
set -euo pipefail

: "${APP_HOST:?set APP_HOST, e.g. app.omelenetskiy.xyz}"
: "${TELEMETRY_HOST:?set TELEMETRY_HOST, e.g. telemetry.omelenetskiy.xyz}"
: "${UPSTREAM_ORIGIN:=https://tesla-y-dashboard.netlify.app}"
: "${UPSTREAM_HOST:=tesla-y-dashboard.netlify.app}"
: "${PUBLIC_KEY_FILE:=/home/ubuntu/TeslaApp/public/.well-known/appspecific/com.tesla.3p.public-key.pem}"
: "${STAGED_PUBLIC_KEY_DIR:=/var/www/tesla-public-key}"
: "${APP_EMAIL:=ops@${APP_HOST#*.}}"
: "${CHECK_INTERVAL_SECONDS:=15}"
: "${MAX_WAIT_SECONDS:=3600}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
HTTP_SITE="/etc/nginx/sites-available/${APP_HOST}.http.conf"
HTTP_SITE_LINK="/etc/nginx/sites-enabled/${APP_HOST}.http.conf"
APP_CERT="/etc/letsencrypt/live/${APP_HOST}/fullchain.pem"
APP_KEY="/etc/letsencrypt/live/${APP_HOST}/privkey.pem"
STAGED_PUBLIC_KEY_FILE="${STAGED_PUBLIC_KEY_DIR}/com.tesla.3p.public-key.pem"
STARTED_AT="$(date +%s)"

sudo mkdir -p /var/www/certbot
sudo test -f "$PUBLIC_KEY_FILE"
sudo mkdir -p "$STAGED_PUBLIC_KEY_DIR"
sudo cp "$PUBLIC_KEY_FILE" "$STAGED_PUBLIC_KEY_FILE"
sudo chmod 644 "$STAGED_PUBLIC_KEY_FILE"

sed \
  -e "s|__APP_HOST__|${APP_HOST}|g" \
  -e "s|__PUBLIC_KEY_FILE__|${STAGED_PUBLIC_KEY_FILE}|g" \
  -e "s|__UPSTREAM_ORIGIN__|${UPSTREAM_ORIGIN}|g" \
  -e "s|__UPSTREAM_HOST__|${UPSTREAM_HOST}|g" \
  "$ROOT_DIR/nginx-app-http-bootstrap.conf.template" | sudo tee "$HTTP_SITE" >/dev/null

sudo ln -sfn "$HTTP_SITE" "$HTTP_SITE_LINK"
sudo nginx -t
sudo systemctl reload nginx

echo "HTTP bootstrap site installed for $APP_HOST"

echo "Waiting for DNS of $APP_HOST to resolve on the VM..."
while true; do
  if getent ahosts "$APP_HOST" >/dev/null 2>&1; then
    echo "DNS is visible on VM for $APP_HOST"
    break
  fi
  now="$(date +%s)"
  elapsed="$((now - STARTED_AT))"
  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "Timed out waiting for DNS after ${MAX_WAIT_SECONDS}s" >&2
    exit 1
  fi
  sleep "$CHECK_INTERVAL_SECONDS"
done

sudo certbot certonly \
  --webroot -w /var/www/certbot \
  --non-interactive --agree-tos -m "$APP_EMAIL" --no-eff-email \
  -d "$APP_HOST" \
  --key-type ecdsa \
  --reuse-key

sudo test -f "$APP_CERT"
sudo test -f "$APP_KEY"

cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose -f docker-compose.sni-router.yml up -d

APP_HOST="$APP_HOST" TELEMETRY_HOST="$TELEMETRY_HOST" APP_CERT="$APP_CERT" APP_KEY="$APP_KEY" PUBLIC_KEY_FILE="$PUBLIC_KEY_FILE" UPSTREAM_ORIGIN="$UPSTREAM_ORIGIN" UPSTREAM_HOST="$UPSTREAM_HOST" \
  /home/ubuntu/TeslaApp/deploy/domain-router/install-on-vm.sh

echo "Cutover finished for $APP_HOST"


