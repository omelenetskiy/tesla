#!/usr/bin/env bash
set -euo pipefail

: "${APP_HOST:?set APP_HOST, e.g. app.omelenetskiy.xyz}"
: "${CERTBOT_DNS_PLUGIN:=cloudflare}"

sudo certbot certonly \
  --"$CERTBOT_DNS_PLUGIN" \
  --agree-tos -m "ops@${APP_HOST#*.}" --no-eff-email \
  -d "$APP_HOST" \
  --key-type ecdsa \
  --reuse-key

LIVE="/etc/letsencrypt/live/${APP_HOST}"
sudo test -f "$LIVE/fullchain.pem"
sudo test -f "$LIVE/privkey.pem"

openssl x509 -in "$LIVE/fullchain.pem" -noout -subject -issuer -dates

echo
echo "App cert ready: $LIVE/fullchain.pem"
echo "App key  ready: $LIVE/privkey.pem"

