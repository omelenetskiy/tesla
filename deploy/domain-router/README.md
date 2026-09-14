# App-domain fast path via Oracle VM

This directory contains the **fastest practical path** to stop waiting on Netlify custom-domain validation while keeping Tesla telemetry on the same VM.

## Do you need another subdomain?

**No.** The fastest path is usually to reuse `app.omelenetskiy.xyz` and point it directly to the Oracle VM.

Use another subdomain only if:
- you do not want to touch `app.omelenetskiy.xyz` yet, or
- you want a throwaway Tesla-specific app domain like `tesla.omelenetskiy.xyz`.

## Why this needs special routing

The VM already runs Fleet Telemetry on port `443`, and Tesla telemetry needs raw TLS + mTLS there.
That means a normal nginx virtual host on `443` will not work by itself.

The solution in this directory is:
- nginx **stream** routing on external `:443` using SNI
- route `telemetry.omelenetskiy.xyz` to the Fleet Telemetry container on `127.0.0.1:8443`
- route `app.omelenetskiy.xyz` to an internal nginx HTTPS site on `127.0.0.1:9443`
- the internal HTTPS site serves the Tesla public key and proxies all other traffic to `https://tesla-y-dashboard.netlify.app`

## Files

- `nginx-stream-router.conf.template` — TCP/SNI router for `443`
- `nginx-app-proxy.conf.template` — internal HTTPS site for the app domain
- `install-on-vm.sh` — renders and installs the nginx config on the VM
- `../fleet-telemetry/docker-compose.sni-router.yml` — router-compatible telemetry compose file

## Fastest recommended flow

### 1. Point the app domain to the VM

Set DNS:

```dns
app.omelenetskiy.xyz. A 130.61.30.119
```

If you do not want to repoint `app`, create a new app domain such as:

```dns
tesla.omelenetskiy.xyz. A 130.61.30.119
```

## 2. Issue an app certificate on the VM

Use the dedicated app-cert script so you do **not** overwrite the telemetry cert directory.

```bash
cd /home/ubuntu/TeslaApp/deploy/domain-router
chmod +x issue-app-cert.sh
APP_HOST=app.omelenetskiy.xyz ./issue-app-cert.sh
```

That creates a Let's Encrypt cert for the app host under `/etc/letsencrypt/live/<app-host>/`.

## 3. Install the nginx router config

On the VM:

```bash
cd /home/ubuntu/TeslaApp/deploy/domain-router
chmod +x install-on-vm.sh
APP_HOST=app.omelenetskiy.xyz \
TELEMETRY_HOST=telemetry.omelenetskiy.xyz \
./install-on-vm.sh
```

This will:
- ensure `nginx.conf` includes `/etc/nginx/streams-enabled/*`
- install the internal app HTTPS site on `127.0.0.1:9443`
- install the SNI stream router on external `:443`
- reload nginx

## 4. Switch Fleet Telemetry to the router-aware compose file

On the VM:

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose -f docker-compose.sni-router.yml up -d
```

That moves Fleet Telemetry off direct host `:443` and binds it to `127.0.0.1:8443`, so nginx can own the external `:443` socket and route by SNI.

## 5. Verify both hosts

From your machine:

```bash
curl -I https://app.omelenetskiy.xyz/
curl -I https://app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem
openssl s_client -connect telemetry.omelenetskiy.xyz:443 -servername telemetry.omelenetskiy.xyz -brief
```

## 6. Re-register Tesla app domain

After the app host is serving the well-known key on the custom domain, run:

```bash
cd /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp
node --env-file=.env --import ./scripts/register.mjs deploy/fleet-telemetry/register-partner.mts --domain=app.omelenetskiy.xyz --dry-run
```

Then run the live registration and pair with:

```text
https://tesla.com/_ak/app.omelenetskiy.xyz
```

## Notes

- If Tesla registration is still tied to `tesla-y-dashboard.netlify.app`, the short-term pairing URL remains:
  - `https://tesla.com/_ak/tesla-y-dashboard.netlify.app`
- Long-term, the registration should move to a domain under `omelenetskiy.xyz` so telemetry on `telemetry.omelenetskiy.xyz` satisfies the root-domain rule.
- Another subdomain is **optional**, not required.


