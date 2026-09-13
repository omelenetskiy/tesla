#!/usr/bin/env bash
# Issue a publicly trusted certificate for the telemetry host.
#
# Why this script exists at all: the fleet-telemetry server is mTLS-only, and Tesla's FAQ is
# explicit that the *server* certificate must be signed by a commonly trusted CA — a mkcert /
# private-CA cert is the thing that gets you `tls: bad certificate` in the server log and a
# car that never connects. Let's Encrypt is free and accepted.
#
# DNS-01 is used deliberately: it needs no inbound port, so the certificate can be issued for
# a machine sitting behind a NAT on a home connection. HTTP-01 would require port 80 to be
# reachable, which is the thing local setups do not have.
#
# Requirements: certbot + a DNS plugin for the zone that holds TELEMETRY_HOST, and
# TELEMETRY_HOST's root domain must match the domain your developer.tesla.com app is
# registered on — Tesla rejects a config whose hostname is off that root.
set -euo pipefail

: "${TELEMETRY_HOST:?set TELEMETRY_HOST, e.g. telemetry.example.com}"
# certbot DNS plugins: cloudflare, route53, dns_secdns, manual (interactive), ...
: "${CERTBOT_DNS_PLUGIN:=cloudflare}"

CERT_DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$CERT_DIR"

sudo certbot certonly \
  --"$CERTBOT_DNS_PLUGIN" \
  --agree-tos -m "ops@${TELEMETRY_HOST#*.}" --no-eff-email \
  -d "$TELEMETRY_HOST" \
  --key-type ecdsa \
  --reuse-key

LIVE="/etc/letsencrypt/live/${TELEMETRY_HOST}"
sudo cp "$LIVE/fullchain.pem" "$CERT_DIR/fullchain.pem"
sudo cp "$LIVE/privkey.pem"  "$CERT_DIR/privkey.pem"
sudo chown "$(id -u):$(id -g)" "$CERT_DIR"/*.pem

# The vehicle verifies *this* file, so it is also the value for the config POST's `ca`.
openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -dates
echo
echo "ca for fleet_telemetry_config: $CERT_DIR/fullchain.pem"
echo "Verify the chain the car will see with the upstream script:"
echo "  docker run --rm -v \$PWD:/w -w /w tesla/fleet-telemetry:v0.9.4 sh -c \\"
echo "    'apt-get update -qq && apt-get install -y -qq jq openssl >/dev/null && ./tools/check_server_cert.sh'"
