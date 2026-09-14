# 🚀 Tesla App Deployment & Sync Guide

## Quick Start

### 1. Initial Setup (One-time)

Set environment variables for your VM:

```bash
export VM_USER=ubuntu
export VM_HOST=app.omelenetskiy.xyz
export VM_PATH=/home/ubuntu/TeslaApp
export SSH_KEY=$HOME/.ssh/id_rsa
export TELEMETRY_HOST=telemetry.omelenetskiy.xyz
```

### 2. Deploy to VM (Simple Mode)

```bash
# Sync code and build on VM
bash scripts/deploy.sh

# Or dry-run first to see what changes
bash scripts/deploy.sh --dry-run

# Skip build (only sync code)
bash scripts/deploy.sh --skip-build
```

## Complete Workflow

### A. Making Code Changes Locally

```bash
# 1. Make your changes locally
# 2. Test locally with:
npm run dev

# 3. Commit to git
git add .
git commit -m "Feature: Add new telemetry monitoring"

# 4. Deploy to VM
bash scripts/deploy.sh
```

### B. Real-time Sync (Watch Mode)

For continuous sync while developing:

```bash
# Install fswatch if needed (macOS)
brew install fswatch

# Create a watch script
cat > sync-watch.sh << 'EOF'
#!/bin/bash
fswatch -r --exclude='.next' --exclude='node_modules' . | while read file; do
  echo "Change detected: $file"
  bash scripts/deploy.sh --skip-build
done
EOF

chmod +x sync-watch.sh

# Run in background
./sync-watch.sh &
```

### C. VM-side Commands

```bash
# SSH to VM
ssh -i $SSH_KEY $VM_USER@$VM_HOST

# Check app status
pm2 status

# View app logs
pm2 logs TeslaApp

# Restart app
pm2 restart TeslaApp

# Check telemetry status
docker ps | grep fleet-telemetry

# View telemetry logs (last 50 lines)
docker-compose -f deploy/fleet-telemetry/docker-compose.sni-router.yml logs -f fleet-telemetry --tail=50

# Check ingester status
pm2 status TeslaApp-Ingester
```

## Telemetry Configuration

### Available Data Fields

The `config.extended.json` includes comprehensive telemetry fields:

**Battery & Power:**
- PackVoltage, PackCurrent
- PowerKw
- EstBatteryRange, Soc
- BatteryHeaterOn, BatteryGridHeaterOn

**Thermal:**
- InsideTempC, OutsideTempC
- SeatHeaterLeft/Right/RearLeft/RearCenter/RearRight
- CabinOvrheatProtectionActive/Mode
- ClimateKeeperMode

**Driving:**
- VehicleSpeed, Gear, GpsHeading
- Odometer, Location
- BrakePedalActive, CruiseControlState
- PowerKw (motor)

**Safety & Monitoring:**
- BlindSpotMonitor{Left,Right,Mode}
- CollisionWarning, EmergencyBraking{,Active}
- LaneKeepAssist{Active,Mode}
- TrackMode

**Tire Pressure (TPMS):**
- TpmsFlPressure, TpmsFrPressure, TpmsRlPressure, TpmsRrPressure
- TpmsFlStatus, TpmsFrStatus, TpmsRlStatus, TpmsRrStatus

**Charging:**
- DetailedChargeState, ChargeAmps, ChargeEnergy
- ChargerVoltage, ChargerCurrent, ChargerPhases, ChargerPower
- ChargerPresent, ChargerType, ChargePortOpen, ChargeDoorOpen

**Vehicle Info:**
- VehicleName, VehicleType, PaintColor, Trim, WheelType, WheelSize
- Firmware, ServiceMode

**Efficiency:**
- MilesSinceReset, SelfDrivingMilesSinceReset

### Enable Telemetry

1. **On the VM:**

```bash
# Start telemetry receiver
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose -f docker-compose.sni-router.yml up -d

# Start ingester (reads telemetry and stores in database)
cd /home/ubuntu/TeslaApp
npm run telemetry:ingest -- --compose-file=deploy/fleet-telemetry/docker-compose.sni-router.yml
```

2. **Configure Vehicle:**

```bash
# From local machine with Tesla credentials
export TESLA_HTTP_PROXY_URL=https://telemetry.omelenetskiy.xyz:4443
node --env-file=.env --import ./scripts/register.mjs \
  deploy/fleet-telemetry/configure-vehicle.mts --hostname=$TELEMETRY_HOST --port=443
```

### Monitor Telemetry Data

```bash
# View real-time decoded records
docker-compose -f deploy/fleet-telemetry/docker-compose.sni-router.yml logs -f fleet-telemetry | grep record_payload

# Check database
ssh $VM_USER@$VM_HOST "psql $DATABASE_URL -c 'SELECT COUNT(*) FROM fleet_telemetry_events'"
```

## Architecture

### Components

```
Local Development (Your Computer)
├── React/Next.js App
├── Git Repository
├── Deploy Script
└── Watch Script (optional)
        │
        ├─── rsync (code sync) ─────┐
        │                            │
        └─── SSH (commands) ─────────┘
                                    │
                                    ▼
         VM (app.omelenetskiy.xyz)
         ├── Nginx (SNI routing)
         │   ├── app.omelenetskiy.xyz:443 → App
         │   └── telemetry.omelenetskiy.xyz:443 → Telemetry (8443)
         │
         ├── Next.js App (PM2)
         │
         ├── Fleet Telemetry Receiver (Docker)
         │   └── Decodes vehicle data
         │
         ├── Telemetry Ingester (Node)
         │   └── Writes to Database
         │
         ├── Vehicle Command Proxy (:4443)
         │
         └── PostgreSQL Database
             └── fleet_telemetry_events
                 vehicle_states
```

### Data Flow

```
Tesla Vehicle
    ↓ (TLS Client Certificate)
Telemetry Receiver (Fleet Telemetry)
    ↓ (Decodes Protobuf)
Ingester (node scripts/ingest-fleet-telemetry.mts)
    ↓ (Stores)
Database (fleet_telemetry_events)
    ↓ (Query API)
Dashboard UI (Real-time charts)
```

## Troubleshooting

### SSH Connection Failed

```bash
# Test connection
ssh -i $SSH_KEY -vv $VM_USER@$VM_HOST "echo OK"

# Check SSH key
ssh-keygen -l -f $SSH_KEY

# Ensure key is added to agent
ssh-add $SSH_KEY
```

### Build Failed on VM

```bash
# SSH and check logs
ssh $VM_USER@$VM_HOST "cd $VM_PATH && npm ci"

# Check Node version
ssh $VM_USER@$VM_HOST "node --version && npm --version"

# View full build errors
pm2 logs TeslaApp --lines=200
```

### Telemetry Not Receiving Data

```bash
# Check container logs
docker-compose -f deploy/fleet-telemetry/docker-compose.sni-router.yml logs fleet-telemetry

# Verify vehicle is synced
npm run verify

# Check /etc/hosts on VM
ssh $VM_USER@$VM_HOST "grep telemetry /etc/hosts"

# Ensure hairpin entry exists
ssh $VM_USER@$VM_HOST "echo '127.0.0.1 $TELEMETRY_HOST' | sudo tee -a /etc/hosts"
```

### Database Issues

```bash
# Check migrations
ssh $VM_USER@$VM_HOST \
  "psql $DATABASE_URL -c '\\dt fleet_telemetry_events'"

# Apply migrations
ssh $VM_USER@$VM_HOST \
  "cd $VM_PATH && npx supabase db push"
```

## Environment Variables

Add to `.env` or `.env.local`:

```bash
# VM Configuration
VM_USER=ubuntu
VM_HOST=app.omelenetskiy.xyz
VM_PATH=/home/ubuntu/TeslaApp
SSH_KEY=$HOME/.ssh/id_rsa
TELEMETRY_HOST=telemetry.omelenetskiy.xyz

# Tesla API (for vehicle configuration)
TESLA_HTTP_PROXY_URL=https://telemetry.omelenetskiy.xyz:4443

# Supabase (for telemetry ingester)
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...

# Fleet API
TESLA_PARTNER_API_KEY=...
TESLA_PARTNER_CLIENT_ID=...
```

## Performance Tips

1. **Monitor rsync bandwidth:**
   ```bash
   # Limit bandwidth to 10MB/s
   rsync ... --bwlimit=10240
   ```

2. **Incremental syncs:**
   - Deploy script only syncs changed files
   - Use `--skip-build` when only UI changes

3. **PM2 clustering:**
   ```bash
   # Enable multi-core on VM
   ssh $VM_USER@$VM_HOST "pm2 scale TeslaApp max"
   ```

4. **Database optimization:**
   - Index frequently queried columns
   - Archive old telemetry events
   ```bash
   ssh $VM_USER@$VM_HOST \
     "psql $DATABASE_URL -c 'CREATE INDEX ON fleet_telemetry_events(vin, created_at)'"
   ```

## Advanced: Continuous Deployment

### GitHub Actions Integration

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VM

on:
  push:
    branches: [main, master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Deploy to VM
        env:
          SSH_KEY: ${{ secrets.SSH_KEY }}
          VM_USER: ${{ secrets.VM_USER }}
          VM_HOST: ${{ secrets.VM_HOST }}
        run: bash scripts/deploy.sh
```

### Slack Notifications

```bash
# Add to deploy.sh
if [ "$DRY_RUN" = false ] && [ "$SKIP_BUILD" = false ]; then
    curl -X POST $SLACK_WEBHOOK \
      -H 'Content-type: application/json' \
      -d "{\"text\":\"✨ Deployed to $VM_HOST\"}"
fi
```

## Rollback

```bash
# Revert to previous git commit
git revert HEAD

# Deploy previous version
bash scripts/deploy.sh

# Or manually restart on VM
ssh $VM_USER@$VM_HOST "cd $VM_PATH && git reset --hard HEAD~1 && npm run build && pm2 restart TeslaApp"
```

## Support

For issues, check:
1. `/logs/` directory for deployment logs
2. `pm2 logs TeslaApp` for app errors
3. `docker-compose logs fleet-telemetry` for receiver errors
4. `docs/AGENT_TESLA_FLEET_TELEMETRY_RUNBOOK.md` for telemetry setup

