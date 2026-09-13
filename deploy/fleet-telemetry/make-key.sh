#!/usr/bin/env bash
# Create the application's virtual key pair.
#
# Tesla requires an EC key on prime256v1 (secp256r1). The public half is published on the
# app's domain and registered with Tesla; the private half never leaves this machine. A key on
# another curve is valid EC and simply never accepted, so it is asserted here instead.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)/keys"
PRIVATE="$DIR/private.pem"
PUBLIC="$DIR/public.pem"

mkdir -p "$DIR"
if [[ -e "$PRIVATE" ]]; then
  echo "refusing to overwrite $PRIVATE" >&2
  echo "a replaced key invalidates the one Tesla has registered and every car that paired with it." >&2
  echo "if you are sure, delete it yourself, then re-run this and re-do register-partner.mts." >&2
  exit 1
fi

openssl ecparam -name prime256v1 -genkey -noout -out "$PRIVATE"
openssl ec -in "$PRIVATE" -pubout -out "$PUBLIC" 2>/dev/null
chmod 600 "$PRIVATE"
chmod 644 "$PUBLIC"

# Assert the curve rather than trusting the command above.
curve="$(openssl ec -in "$PRIVATE" -text -noout 2>/dev/null | grep -o 'prime256v1\|secp[0-9]*r1' | head -1)"
if [[ "$curve" != "prime256v1" ]]; then
  echo "generated key uses ${curve:-unknown curve}, not prime256v1" >&2
  exit 1
fi

echo "private  $PRIVATE   (0600, never served, never committed)"
echo "public   $PUBLIC"
echo
echo "point the app at it:  TESLA_FLEET_PRIVATE_KEY_PATH=$(realpath "$PRIVATE")"
echo "then serve and register:"
echo "  1. copy $PUBLIC to public/.well-known/appspecific/com.tesla.3p.public-key.pem"
echo "  2. verify https://<your-app-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem"
echo "  3. node --env-file=.env --import ./scripts/register.mjs \\\\"
echo "       deploy/fleet-telemetry/register-partner.mts"
echo "  4. open https://tesla.com/_ak/<your-app-domain> as a trusted user and accept on the car"

