# 🚀 Quick Deploy Cheatsheet

## Setup (First Time)

```bash
# 1. Configure environment
export VM_USER=ubuntu
export VM_HOST=app.omelenetskiy.xyz
export VM_PATH=/home/ubuntu/TeslaApp
export SSH_KEY=~/.ssh/id_rsa
export TELEMETRY_HOST=telemetry.omelenetskiy.xyz

# 2. Test SSH connection
ssh -i $SSH_KEY $VM_USER@$VM_HOST "echo OK"

# 3. Make scripts executable
chmod +x scripts/deploy.sh scripts/init-git.sh
```

## Daily Workflow

### 1. Make Changes Locally
```bash
# Make your code changes
# Test locally
npm run dev
```

### 2. Commit & Push
```bash
git add .
git commit -m "Feature: description"
# git push
```

### 3. Deploy to VM (Choose One)

**Full deploy (sync + build):**
```bash
npm run deploy
# or: bash scripts/deploy.sh
```

**Quick sync only (no rebuild):**
```bash
npm run deploy:sync-only
# or: bash scripts/deploy.sh --skip-build
```

**Dry run first:**
```bash
npm run deploy:dry
# or: bash scripts/deploy.sh --dry-run
```

### 4. Verify on VM

```bash
# SSH to VM
ssh -i $SSH_KEY $VM_USER@$VM_HOST

# Check app status
pm2 status

# View logs
pm2 logs TeslaApp

# Check telemetry
docker ps | grep fleet-telemetry
```

## Telemetry Commands

```bash
# Start telemetry receiver on VM
ssh $VM_USER@$VM_HOST "cd $VM_PATH/deploy/fleet-telemetry && docker-compose -f docker-compose.sni-router.yml up -d"

# View telemetry data
ssh $VM_USER@$VM_HOST "docker-compose -f $VM_PATH/deploy/fleet-telemetry/docker-compose.sni-router.yml logs -f fleet-telemetry"

# Start ingester
npm run telemetry:ingest

# Verify vehicle config
npm run verify
```

## Troubleshooting

```bash
# SSH connection issues
ssh -vv -i $SSH_KEY $VM_USER@$VM_HOST "echo OK"

# Build errors on VM
ssh $VM_USER@$VM_HOST "cd $VM_PATH && npm run build 2>&1 | tail -50"

# Restart app
ssh $VM_USER@$VM_HOST "cd $VM_PATH && pm2 restart TeslaApp"

# See what changed locally
git diff

# Commit staged changes
git status
```

## Environment Variables for .env or .env.local

```bash
VM_USER=ubuntu
VM_HOST=app.omelenetskiy.xyz
VM_PATH=/home/ubuntu/TeslaApp
SSH_KEY=$HOME/.ssh/id_rsa
TELEMETRY_HOST=telemetry.omelenetskiy.xyz
TESLA_HTTP_PROXY_URL=https://telemetry.omelenetskiy.xyz:4443
```

## Real-time Monitoring

```bash
# Watch app logs
ssh $VM_USER@$VM_HOST "pm2 logs TeslaApp --lines=50 --nostream &"

# Watch telemetry
ssh $VM_USER@$VM_HOST "docker-compose -f $VM_PATH/deploy/fleet-telemetry/docker-compose.sni-router.yml logs -f fleet-telemetry"

# Monitor CPU/Memory
ssh $VM_USER@$VM_HOST "watch -n 1 'pm2 monit'"
```

## File Structure

```
scripts/
├── deploy.sh              # Main deployment script
├── init-git.sh            # Git initialization
├── ingest-fleet-telemetry.mts  # Telemetry ingester
└── ...

deploy/
├── fleet-telemetry/
│   ├── config.extended.json    # Comprehensive telemetry config
│   ├── docker-compose.sni-router.yml
│   └── ...
└── ...

DEPLOYMENT.md             # Full deployment guide
DEPLOYMENT-QUICK.md       # This file
```

## Telemetry Data Categories

- **Battery:** PackVoltage, PackCurrent, Soc, EstBatteryRange
- **Thermal:** InsideTempC, OutsideTempC, BatteryHeaterOn
- **Driving:** VehicleSpeed, Gear, Location, Odometer
- **Safety:** BlindSpotMonitor, EmergencyBraking, LaneKeepAssist
- **Charging:** ChargeAmps, ChargerVoltage, ChargerPower
- **Tires:** TpmsPressure{Fl,Fr,Rl,Rr}, TpmsStatus
- **Efficiency:** MilesSinceReset, SelfDrivingMilesSinceReset

## Performance Notes

- First deploy takes ~5-10 minutes (npm install + build)
- Subsequent deploys take ~1-3 minutes (only changed files)
- Use `--skip-build` for UI-only changes to save time
- Telemetry data updates every 500ms from vehicle

## Rollback

```bash
git log --oneline
git revert <commit-hash>
npm run deploy
```

---

For detailed instructions, see `DEPLOYMENT.md`

