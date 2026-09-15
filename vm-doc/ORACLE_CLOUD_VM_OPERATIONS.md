# DriveScope VM Operations Guide

This is the authoritative instruction for an LLM agent operating the DriveScope Oracle Cloud VM: SSH access, deployment, process management, Docker telemetry, migrations, backfill, verification, rollback, and safe troubleshooting.

> **Current topology:** the frontend and Tesla Fleet Telemetry receiver run on one Oracle VM. Netlify is not used.

## 1. Architecture

```text
Internet
   │
   ├── app.omelenetskiy.xyz
   │       nginx TLS vhost
   │          ↓
   │       PM2: TeslaApp
   │          ↓
   │       Next.js on localhost:3000
   │
   └── telemetry.omelenetskiy.xyz
           nginx/SNI routing
              ↓
           Docker: fleet-telemetry
              ↓
           decoded record_payload logs
              ↓
           PM2: TeslaTelemetryIngest
              ↓
           Supabase:
             fleet_telemetry_events
             vehicle_states
             trips
             battery_snapshots
             telemetry_field_freshness
             telemetry_ingest_checkpoints
```

### VM

| Item | Value |
|---|---|
| Public IP | `130.61.30.119` |
| SSH user | `ubuntu` |
| Remote project | `/home/ubuntu/TeslaApp` |
| App domain | `app.omelenetskiy.xyz` |
| Telemetry domain | `telemetry.omelenetskiy.xyz` |
| App process | PM2 `TeslaApp` |
| Ingest process | PM2 `TeslaTelemetryIngest` |
| Telemetry receiver | Docker `fleet-telemetry` |
| Command proxy | Docker `vehicle-command-proxy` |

## 1.1 Authoritative domain and port matrix

The public domains must point to the VM public IP `130.61.30.119`.

| Domain / endpoint | DNS target | Public port | VM listener / destination | Owner | Purpose |
|---|---:|---:|---|---|---|
| `app.omelenetskiy.xyz` | `130.61.30.119` | TCP 443 | nginx TLS vhost → `127.0.0.1:3000` | PM2 `TeslaApp` / Next.js | Main web application, login, API routes |
| `app.omelenetskiy.xyz` | `130.61.30.119` | TCP 80 | nginx HTTP vhost | nginx | HTTP handling/redirects; HTTPS is canonical |
| `app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem` | `130.61.30.119` | TCP 443 | nginx/static public file | nginx/static file | Tesla virtual-key public key; must return `200`, never app login |
| `telemetry.omelenetskiy.xyz` | `130.61.30.119` | TCP 443 | nginx SNI route → `127.0.0.1:8443` | Docker `fleet-telemetry` | Tesla Fleet Telemetry HTTPS/mTLS receiver |
| `telemetry.omelenetskiy.xyz` | `130.61.30.119` | TCP 80 | nginx HTTP vhost | nginx | HTTP handling for telemetry host; do not use as the receiver protocol |
| `fleet-telemetry` internal | not public | TCP 8443 | Docker/container listener on `127.0.0.1:8443` | Docker `fleet-telemetry` | Internal TLS target for nginx SNI routing |
| `fleet-telemetry` internal | not public | TCP 9090 | Docker/container metrics listener | Docker `fleet-telemetry` | Prometheus/metrics endpoint; do not expose publicly |
| `fleet-telemetry` internal | not public | TCP 4269 | Docker/container profiler listener | Docker `fleet-telemetry` | Profiling/debug listener; do not expose publicly |
| `vehicle-command-proxy` internal | not public | TCP 4443 | Docker listener, currently published by compose | Docker `vehicle-command-proxy` | Fleet vehicle-command HTTPS proxy; never route the public app domain here |
| Next.js internal | not public | TCP 3000 | `127.0.0.1:3000` | PM2 `TeslaApp` | Internal application server; nginx is the public entrypoint |

### DNS requirements

```text
app.omelenetskiy.xyz       A 130.61.30.119
telemetry.omelenetskiy.xyz A 130.61.30.119
```

Do not point either production domain to Netlify. Do not expose ports `3000`, `4269`, `4443`, `8443`, or `9090` directly to the Internet. Public traffic must enter through nginx on ports `80`/`443`.

## 2. SSH access

### Required local key

The private key must exist locally and must not be committed or copied into the repository:

```text
~/.ssh/ubuntu-ssh-key-2026-09-14.key
```

Check permissions:

```bash
chmod 600 ~/.ssh/ubuntu-ssh-key-2026-09-14.key
ls -l ~/.ssh/ubuntu-ssh-key-2026-09-14.key
```

### Direct SSH

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key \
  ubuntu@130.61.30.119
```

Quick connectivity check:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key \
  -o ConnectTimeout=8 \
  ubuntu@130.61.30.119 \
  'echo VM_OK && hostname && pm2 status'
```

### SSH through the application hostname

Use this only when DNS resolves directly to the VM:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key \
  ubuntu@app.omelenetskiy.xyz
```

### DNS-filter workaround

Some local networks redirect unknown/custom domains through an Infoblox DNS response. Test the VM directly while preserving TLS SNI and Host:

```bash
curl -sS -D - -o /dev/null \
  --resolve app.omelenetskiy.xyz:443:130.61.30.119 \
  https://app.omelenetskiy.xyz/login
```

Expected for the login page: `HTTP 200`.

Check the Tesla public key:

```bash
curl -sS -D - -o /dev/null \
  --resolve app.omelenetskiy.xyz:443:130.61.30.119 \
  https://app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Expected: `HTTP 200` and an X.509 public key response.

Do not use `curl -k` unless you are deliberately diagnosing TLS. Prefer `--resolve`, which keeps certificate validation and SNI correct.

## 3. Local project variables

The deploy script accepts these variables:

```bash
export VM_USER=ubuntu
export VM_HOST=130.61.30.119
export VM_PATH=/home/ubuntu/TeslaApp
export SSH_KEY=~/.ssh/ubuntu-ssh-key-2026-09-14.key
export TELEMETRY_HOST=telemetry.omelenetskiy.xyz
```

The script defaults to `app.omelenetskiy.xyz` for `VM_HOST`, but using the VM IP avoids local DNS indirection during deployment.

Do not print or commit values from `.env`. The deploy script excludes `.env` and `.env.local`; the VM keeps its own environment file.

## 4. Before every deploy

Run locally from the project root:

```bash
cd /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp

npx tsc --noEmit
npm run verify
npm run telemetry:test
npm test -- --runInBand --silent
npm run build
npm run lint
```

`npm run lint` may report pre-existing warnings. Deployment should not proceed with TypeScript errors, failed tests, or a failed production build.

Check the working tree:

```bash
git status --short
git log --oneline -5
```

Do not deploy unreviewed unrelated changes. Commit the intended change before a normal production deploy.

## 5. Dry-run deployment

The canonical deployment implementation is:

```text
scripts/deploy.sh
```

Run a dry-run first:

```bash
VM_USER=ubuntu \
VM_HOST=130.61.30.119 \
VM_PATH=/home/ubuntu/TeslaApp \
SSH_KEY=~/.ssh/ubuntu-ssh-key-2026-09-14.key \
bash scripts/deploy.sh --dry-run
```

Dry-run verifies:

- `rsync` exists;
- `ssh` exists;
- the key exists;
- SSH connectivity works;
- the target path and build action are printed;
- no files or processes are changed.

## 6. Full frontend + telemetry ingest deploy

Use this for normal application changes:

```bash
VM_USER=ubuntu \
VM_HOST=130.61.30.119 \
VM_PATH=/home/ubuntu/TeslaApp \
SSH_KEY=~/.ssh/ubuntu-ssh-key-2026-09-14.key \
bash scripts/deploy.sh
```

The script performs this sequence:

1. Checks `rsync`, `ssh`, and the private key.
2. Opens an SSH connection test.
3. Synchronizes the local checkout to `/home/ubuntu/TeslaApp` with `rsync`.
4. Excludes local secrets and generated directories:
   - `.env`
   - `.env.local`
   - `.git`
   - `node_modules`
   - `.next`
   - `.netlify`
   - `.fleet-telemetry` (persistent ingest cursor)
   - telemetry certificate material
5. Runs remote `npm ci --prefer-offline --no-audit`.
6. Runs remote `npm run build`.
7. Restarts or creates PM2 process `TeslaApp`.
8. Restarts or creates PM2 process `TeslaTelemetryIngest`.
9. Runs `pm2 save`.
10. Checks Docker telemetry containers.

### Important rsync rule

The script uses `rsync --delete`. Never remove `.fleet-telemetry` from the exclude list: it contains the persistent log-ingest cursor and deleting it can cause unnecessary replay or gaps during restart.

### NPM aliases

These aliases are available in `package.json`:

```bash
npm run deploy       # full rsync + remote npm ci + build + PM2 restart
npm run deploy:dry   # dry-run
npm run deploy:sync-only  # sync without remote build/restart
```

`deploy:sync-only` does **not** restart PM2. If it is used, restart explicitly:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'pm2 restart TeslaApp --update-env && pm2 restart TeslaTelemetryIngest --update-env && pm2 save'
```

## 7. PM2 operations

Connect:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
```

Status:

```bash
pm2 status
```

Expected processes:

```text
TeslaApp              online
TeslaTelemetryIngest  online
```

Restart app only:

```bash
pm2 restart TeslaApp --update-env
pm2 save
```

Restart telemetry ingest only:

```bash
pm2 restart TeslaTelemetryIngest --update-env
pm2 save
```

Restart both:

```bash
pm2 restart TeslaApp --update-env
pm2 restart TeslaTelemetryIngest --update-env
pm2 save
```

Inspect process details:

```bash
pm2 describe TeslaApp
pm2 describe TeslaTelemetryIngest
```

Logs:

```bash
pm2 logs TeslaApp --lines 100 --nostream
pm2 logs TeslaApp-error --lines 100 --nostream
pm2 logs TeslaTelemetryIngest --lines 100 --nostream
pm2 logs TeslaTelemetryIngest-error --lines 100 --nostream
```

Clear only old PM2 logs when diagnosing a new incident:

```bash
pm2 flush TeslaTelemetryIngest
pm2 restart TeslaTelemetryIngest --update-env
```

Do not use `pm2 flush` during an incident before saving the relevant output.

## 8. Docker telemetry receiver

Remote directory:

```text
/home/ubuntu/TeslaApp/deploy/fleet-telemetry
```

The production routing file is:

```text
deploy/fleet-telemetry/docker-compose.sni-router.yml
```

On this VM the installed command is `docker-compose`, not necessarily the newer `docker compose` subcommand.

### Container status

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose -f docker-compose.sni-router.yml ps
```

Or:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Expected containers:

```text
fleet-telemetry_fleet-telemetry_1
fleet-telemetry_vehicle-command-proxy_1
```

### Start / stop / restart

```bash
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry

docker-compose -f docker-compose.sni-router.yml up -d
docker-compose -f docker-compose.sni-router.yml ps
docker-compose -f docker-compose.sni-router.yml logs --tail=100 fleet-telemetry
```

Restart only the receiver:

```bash
docker-compose -f docker-compose.sni-router.yml restart fleet-telemetry
```

Stop the stack:

```bash
docker-compose -f docker-compose.sni-router.yml down
```

Do not delete certificates or local config volumes while troubleshooting.

## 9. Telemetry ingest loop

The active ingest process is launched by:

```text
deploy/fleet-telemetry/run-ingest-loop.sh
```

Its flow is:

```text
Docker fleet-telemetry container logs
        ↓
docker logs --since/--until with timestamps
        ↓
strip Docker timestamp prefix
        ↓
scripts/ingest-fleet-telemetry.mts --stdin
        ↓
lib/fleet/telemetry-ingest.ts
        ↓
raw events + snapshots + enrichment + checkpoints
```

Persistent cursor:

```text
/home/ubuntu/TeslaApp/.fleet-telemetry/ingest-cursor.utc
```

The cursor is writable by `ubuntu` and excluded from rsync deletion. The loop uses a time range and relies on database txid dedupe.

Check cursor:

```bash
cat /home/ubuntu/TeslaApp/.fleet-telemetry/ingest-cursor.utc
```

Run the parser manually from Docker logs for diagnostics:

```bash
cd /home/ubuntu/TeslaApp
CID="$(docker-compose -f deploy/fleet-telemetry/docker-compose.sni-router.yml ps -q fleet-telemetry)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SINCE="$(date -u -d '60 seconds ago' +%Y-%m-%dT%H:%M:%SZ)"

docker logs --since="$SINCE" --until="$NOW" --timestamps "$CID" 2>&1 \
  | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[^ ]+ //' \
  | node --env-file=.env \
      --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
      --import ./scripts/register.mjs \
      ./scripts/ingest-fleet-telemetry.mts --stdin
```

Run parser in dry-run mode without writing to Supabase:

```bash
cat sample-record.log \
  | node --env-file=.env \
      --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
      --import ./scripts/register.mjs \
      ./scripts/ingest-fleet-telemetry.mts --stdin --dry-run
```

Run local parser tests:

```bash
npm run telemetry:test
```

## 10. What ingestion writes

### Raw source of truth

`fleet_telemetry_events` stores:

- complete raw payload;
- txid and event metadata;
- source field list;
- observed/received timestamps;
- VIN, vehicle and owner relationship;
- resend/activity flags.

Raw insert is deduplicated by:

```text
vehicle_id + txid
```

### Normalized snapshots

`vehicle_states` stores the latest normalized application state per event that maps to a known domain field:

- presence;
- SOC/range;
- speed;
- location;
- odometer;
- pack voltage/current;
- calculated power;
- climate/charging fields.

Unknown provider fields remain in raw payload; they must not be fabricated into domain values.

### Derived history

`persistDerivedHistory()` derives and persists:

- trips;
- charging sessions;
- battery snapshots;
- activity events.

Trips use the unique dedupe key:

```text
t:<started_at>
```

The production database now has the required partial unique indexes in migration `016_history_dedupe_indexes.sql`. The writer uses chunked existing-key lookup plus update/insert instead of relying on PostgREST `ON CONFLICT` inference for a partial index.

## 11. Backfill history

Use after fixing a persistence/schema issue or after importing raw events:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp && npm run telemetry:backfill-history'
```

The command:

1. loads every configured vehicle;
2. reads paginated `vehicle_states` snapshots;
3. derives trips, charging, and battery history;
4. updates/inserts derived rows idempotently;
5. prints a JSON report with `derived`, `persisted`, and `skipped` counts.

Verify immediately after:

```sql
select count(*) as trips,
       max(started_at) as latest_trip
from public.trips;
```

A successful report should have `persisted.trips > 0` when new derived trips exist and `skipped` should not contain `trips`.

## 12. Supabase migrations

Migration files live in:

```text
supabase/migrations/
```

Important history/telemetry migrations include:

- `009_fleet_telemetry_ingest.sql` — raw Fleet events;
- `010_telemetry_data_enrichment.sql` — samples, freshness, checkpoints;
- `011_history_schema_alignment.sql` — legacy/new history alignment and dedupe indexes;
- `012_trip_energy_units.sql` — trip energy provenance columns;
- `014_nullable_trip_energy.sql` — honest null energy state;
- `015_remove_measurement_unit_cells.sql` — clears redundant unit text cells;
- `016_history_dedupe_indexes.sql` — production dedupe indexes required by history persistence.

Before applying a new migration:

1. inspect current production schema;
2. make it forward-only and idempotent where possible;
3. use `if not exists` for indexes/columns when appropriate;
4. verify RLS and constraints;
5. apply through the configured Supabase migration workflow;
6. query the affected table after applying;
7. run the application tests and relevant backfill.

Never put Supabase service-role keys or credentials into this directory or source control.

## 13. Domain and TLS checks

Check app endpoint while bypassing local DNS interception:

```bash
curl -sS -D - -o /dev/null \
  --resolve app.omelenetskiy.xyz:443:130.61.30.119 \
  https://app.omelenetskiy.xyz/login
```

Check Tesla public key:

```bash
curl -sS -D - -o /dev/null \
  --resolve app.omelenetskiy.xyz:443:130.61.30.119 \
  https://app.omelenetskiy.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Check telemetry host:

```bash
curl -sS -D - -o /dev/null \
  --resolve telemetry.omelenetskiy.xyz:443:130.61.30.119 \
  https://telemetry.omelenetskiy.xyz/
```

A `307` from the app root to `/login` is expected for an unauthenticated request. The login page should return `200`. The Tesla public key should return `200` and must not be redirected to login.

## 14. Nginx/domain routing

The VM hosts both domains. Domain-router files are in:

```text
deploy/domain-router/
```

The setup script is:

```text
deploy/domain-router/install-on-vm.sh
```

Do not rerun it casually in production. First inspect the generated nginx configuration and current certificate paths.

Expected routing:

```text
app.omelenetskiy.xyz       → Next.js localhost:3000
telemetry.omelenetskiy.xyz → telemetry localhost:8443
```

If routing is broken, inspect:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo nginx -T | less
```

Use `grep` instead of printing private key material. Never expose certificate private keys in logs or chat.

## 15. Tesla key and certificate procedures

Key and certificate scripts:

```text
deploy/fleet-telemetry/make-key.sh
deploy/fleet-telemetry/issue-cert.sh
```

Only run key generation or certificate issuance when the operation is explicitly required. These operations can affect Tesla pairing and production TLS.

Before changing certificates:

```bash
openssl x509 -in /path/to/fullchain.pem -noout -dates -subject
```

Keep certificate files out of git. The repository `.gitignore` excludes key/certificate extensions and the deploy script excludes telemetry cert directories.

## 16. Rollback

### Application rollback

1. Identify a known-good commit:

```bash
git log --oneline --decorate -20
```

2. Create a temporary rollback branch or checkout the known-good commit locally.
3. Run typecheck/build/tests if time permits.
4. Deploy the known-good checkout with the standard deploy command.
5. Verify PM2 and HTTP endpoints.
6. Return the local checkout to the intended branch.

Do not manually edit production files as a normal rollback method.

### PM2 rollback/restart

If the build succeeded but a process is unhealthy:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'pm2 restart TeslaApp --update-env && pm2 restart TeslaTelemetryIngest --update-env && pm2 save'
```

### Telemetry emergency stop

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'pm2 stop TeslaTelemetryIngest'
```

Stop Docker receiver only when necessary:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose -f docker-compose.sni-router.yml stop fleet-telemetry'
```

Restore service:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose -f docker-compose.sni-router.yml up -d fleet-telemetry && pm2 restart TeslaTelemetryIngest --update-env'
```

## 17. Troubleshooting matrix

### `TeslaApp` is offline

```bash
pm2 status
pm2 logs TeslaApp-error --lines 100 --nostream
curl -I http://localhost:3000/login
```

If local port 3000 fails, inspect the last deployment build and restart process.

### `TeslaTelemetryIngest` is offline

```bash
pm2 status
pm2 logs TeslaTelemetryIngest-error --lines 100 --nostream
cat /home/ubuntu/TeslaApp/.fleet-telemetry/ingest-cursor.utc
```

Check dependencies and environment:

```bash
cd /home/ubuntu/TeslaApp
npm ci --prefer-offline --no-audit
node --version
npm --version
```

Then restart the process.

### Raw events increase but snapshots do not

Check:

- VIN matches the `vehicles.vin` row;
- `mappedFields` is not empty;
- Supabase service-role environment is present;
- `vehicle_states` insert errors in PM2 logs;
- event timestamp is not older than the cached snapshot;
- raw payload uses a known protobuf field mapping.

Unknown provider fields should remain in `fleet_telemetry_events`; they should not be silently treated as normalized data.

### Snapshots increase but trips do not

Run:

```bash
npm run telemetry:backfill-history
```

Then inspect:

```sql
select count(*), max(started_at) from public.trips;
select presence, count(*)
from public.vehicle_states
where collected_at > now() - interval '1 day'
group by presence;
```

Check for:

- pagination limits when reading `vehicle_states`;
- missing location/odometer;
- distance below the minimum trip threshold;
- history persistence errors;
- missing `trips_vehicle_dedupe_uidx`.

### `there is no unique ... ON CONFLICT`

Verify:

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname like '%dedupe%';
```

Migration `016_history_dedupe_indexes.sql` must be applied. The current writer uses explicit existing-row lookup/update/insert because partial indexes are not always inferred by PostgREST upsert.

### `permission denied` for cursor

The cursor must be inside the repo-local writable directory:

```text
/home/ubuntu/TeslaApp/.fleet-telemetry/ingest-cursor.utc
```

Do not use `/var/lib/fleet-telemetry` unless that directory has been created and ownership has been explicitly configured.

### No new telemetry from the car

This may be normal when the vehicle is asleep or a configured field has not changed. Check:

```bash
docker-compose -f deploy/fleet-telemetry/docker-compose.sni-router.yml logs --tail=100 fleet-telemetry
pm2 logs TeslaTelemetryIngest --lines 100 --nostream
```

Do not aggressively wake/poll a sleeping vehicle.

## 18. Safety rules

- Never print `.env`, access tokens, refresh tokens, client secrets, private keys, or service-role keys.
- Never commit `deploy/fleet-telemetry/certs/`, `keys/`, or `.fleet-telemetry/`.
- Do not use `rsync --delete` manually without the same excludes as `scripts/deploy.sh`.
- Do not delete raw `fleet_telemetry_events` during cleanup or migrations.
- Raw events are the replay/audit source of truth.
- Always verify database counts and PM2 status after a deploy.
- Keep the VM topology: app and telemetry are both hosted on the VM; Netlify is not part of the deployment path.

