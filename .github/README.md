# .github — Agent Instructions & Documentation

This folder contains comprehensive instructions for AI agents (Copilot, Claude, etc.) and automated systems to deploy, maintain, and troubleshoot the DriveScope application.

## Files

### [copilot-instructions.md](./copilot-instructions.md)
Global entry point for engineering rules and pointers to `instructions/*.md` (product, architecture, frontend, design, data model, Tesla Fleet API, pages, coding rules, workflow).

### [AGENT_INSTRUCTIONS.md](./AGENT_INSTRUCTIONS.md)
Quick reference guide for common tasks and commands.

**Use this for:**
- Quick SSH commands
- Common telemetry operations
- Checking service status
- Certificate renewal
- Immediate troubleshooting

**Key sections:**
- Quick Reference (architecture, SSH access, directories)
- Common Tasks (status checks, logs, restarts)
- Deployment Workflow (telemetry-specific steps)
- Important Notes for Agents

### [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)
Complete step-by-step procedures for full deployment lifecycle.

**Use this for:**
- Initial system setup
- Complete deployment from scratch
- Understanding each phase
- Maintenance schedules
- Rollback procedures

**Key phases:**
1. Initial Setup
2. Certificate Issuance (TLS via Let's Encrypt)
3. Docker-Compose Configuration (container setup)
4. Systemd Service Setup (autostart on reboot)
5. Start Telemetry Receiver (service startup)
6. Vehicle Configuration (pairing with Tesla)

### [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
Diagnostic procedures and solutions for common issues.

**Use this for:**
- Investigating failures
- Diagnosing problems
- Step-by-step debugging
- Common error scenarios

**Key categories:**
1. Quick Diagnostics (health check script)
2. DNS & Network Issues
3. TLS Certificate Issues
4. Docker Container Issues
5. Systemd Service Issues
6. Network & Firewall Issues
7. Getting Help (data gathering)

## Architecture Overview

Both the frontend app and the Tesla Fleet Telemetry receiver run on the same Oracle Cloud VM. There is **no Netlify deployment** — that was an earlier setup and is no longer used.

```
┌───────────────────────────────────────────────────────────┐
│            DriveScope System — Oracle VM 130.61.30.119    │
├─────────────────────────────┬───────────────────────────────┤
│   Frontend (app)             │   Telemetry receiver          │
│   app.omelenetskiy.xyz       │   telemetry.omelenetskiy.xyz  │
├─────────────────────────────┼───────────────────────────────┤
│ - nginx TLS vhost             │ - Port 443 (HTTPS/mTLS)       │
│ - Next.js app via PM2         │ - Port 9090 (metrics)         │
│   process `TeslaApp`          │ - Docker container            │
│ - Telemetry ingest via PM2    │   `fleet-telemetry`            │
│   process `TeslaTelemetryIngest` │                             │
│ ✓ Vehicle UI                  │ ✓ Fleet Telemetry receiver     │
│ ✓ Login flow                  │ ✓ Certificate issued           │
│ ✓ Dashboard                   │ ✓ Systemd service autostart    │
└─────────────────────────────┴───────────────────────────────┘
```

Deploying the frontend means: `npm run deploy` (`scripts/deploy.sh`) rsyncs the repo to the VM, runs `npm ci && npm run build` there, and restarts the `TeslaApp` and `TeslaTelemetryIngest` PM2 processes. The telemetry Docker containers (`fleet-telemetry`, `vehicle-command-proxy`) are managed separately via `docker-compose` / systemd, as documented in `DEPLOYMENT_RUNBOOK.md`.

## Quick Start for Agents

### 1. Check Current Status
```bash
# Run the health check
cd /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp
bash .github/quick-health-check.sh
```

### 2. For Common Operations
→ See [AGENT_INSTRUCTIONS.md](./AGENT_INSTRUCTIONS.md)

### 3. For Full Deployment
→ See [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)

### 4. For Frontend Deploys
```bash
VM_USER=ubuntu VM_HOST=130.61.30.119 VM_PATH=/home/ubuntu/TeslaApp \
  SSH_KEY=~/.ssh/ubuntu-ssh-key-2026-09-14.key \
  bash scripts/deploy.sh
```

### 5. For Troubleshooting
→ See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## Important Rules for Agents

1. **Always verify before and after**: Run health checks before starting work and after finishing.

2. **Both app and telemetry run on the same VM**: There is no Netlify deployment. Deploy the frontend with `npm run deploy` (`scripts/deploy.sh`), which rsyncs to the VM, builds there, and restarts the `TeslaApp` PM2 process. Do not attempt to deploy to Netlify.

3. **Always use the SSH key**:
   ```bash
   ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
   ```

4. **Document your work**: After completing a task, add an entry to `.logs/operations.log`.

5. **Test HTTPS connectivity after a deploy**: Verify both `curl -I https://app.omelenetskiy.xyz/` (frontend, may 307-redirect to `/login` when unauthenticated — that is expected) and `curl -I https://telemetry.omelenetskiy.xyz/` (telemetry) respond. If DNS-level filtering interferes locally, verify with `curl --resolve app.omelenetskiy.xyz:443:130.61.30.119 ...` instead.

6. **Preserve the systemd service**: Don't delete or modify `/etc/systemd/system/fleet-telemetry.service` without good reason.

7. **Handle certificates carefully**:
   - Keep both `/etc/letsencrypt/` and `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/` in sync
   - Always verify certificate validity before and after changes
   - Set up automatic renewal (certbot cron)

8. **Keep this documentation updated**: When you fix a common issue, add it to TROUBLESHOOTING.md.

## VM Access

### SSH Connection
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
```

### Key Details
- **User**: ubuntu
- **Key**: ~/.ssh/ubuntu-ssh-key-2026-09-14.key
- **Key perms**: 600 (verify with `ls -la ~/.ssh/ubuntu-ssh-key-2026-09-14.key`)
- **Passwordless sudo**: Configured (no password required)

### VM Details
- **IP**: 130.61.30.119 (public)
- **Hostname**: instance-20260914-0314
- **OS**: Ubuntu (likely 20.04 or 22.04)
- **Project path**: /home/ubuntu/TeslaApp
- **Process manager**: PM2 (`TeslaApp`, `TeslaTelemetryIngest`)

## Critical Files

### Local (Laptop/Development)
- `.logs/` — Session logs and operation records
- `.github/` — Agent instructions (this folder)
- `README.md` — Project overview
- `SETUP_RU.md` — Russian setup guide
- `docs/next-steps-oracle-telemetry.md` — Telemetry next steps
- `docs/vm-connection.md` — VM connection reference
- `scripts/deploy.sh` — Frontend deploy script (rsync + build + PM2 restart on the VM)
- `deploy/fleet-telemetry/` — Telemetry deployment files

### Remote (VM)
- `/home/ubuntu/TeslaApp` — Full application checkout, built and served via PM2 (`TeslaApp`)
- `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/` — Active telemetry deployment
- `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/` — TLS certificates
- `/etc/fleet-telemetry/config.json` — Telemetry server config
- `/etc/systemd/system/fleet-telemetry.service` — Systemd service unit
- `/etc/letsencrypt/live/telemetry.omelenetskiy.xyz/` — Let's Encrypt certs
- `~/.pm2/dump.pm2` — Saved PM2 process list (restored on VM reboot)

## Deployment Status

### Completed
- ✅ Frontend and telemetry both run on the Oracle VM (no Netlify)
- ✅ TLS certificates issued (Let's Encrypt ECDSA)
- ✅ Docker-compose configuration for telemetry
- ✅ Systemd service setup for telemetry
- ✅ Fleet Telemetry receiver running
- ✅ Frontend running under PM2 (`TeslaApp`) with `scripts/deploy.sh` as the deploy path
- ✅ Documentation updated to remove stale Netlify references

### In Progress / Next
- 🔄 Vehicle telemetry configuration
- 🔄 Key pairing authorization
- 🔄 Automatic certificate renewal setup
- 🔄 Monitoring and alerting

## Monitoring Checklist

### Daily
- [ ] Check PM2 status: `pm2 status` (both `TeslaApp` and `TeslaTelemetryIngest` should be `online`)
- [ ] Check telemetry container status: `docker-compose ps` (or `docker ps`)
- [ ] Check service status: `sudo systemctl status fleet-telemetry.service`

### Weekly
- [ ] Verify certificate validity (expires 2026-12-13)
- [ ] Check telemetry logs: `docker-compose logs --tail=50`
- [ ] Check app logs: `pm2 logs TeslaApp --lines 50 --nostream`

### Monthly
- [ ] Test container restart: `docker-compose restart`
- [ ] Verify HTTPS connectivity: `curl -I https://telemetry.omelenetskiy.xyz/` and `https://app.omelenetskiy.xyz/`

### Quarterly
- [ ] Renew certificate if needed (before expiry)
- [ ] Review and update documentation

## Version History

| Date | What | Status |
|------|------|--------|
| 2026-09-14 | Initial telemetry setup | ✅ Complete |
| 2026-09-15 | Corrected docs: frontend runs on the VM (PM2), not Netlify | ✅ Complete |
| 2026-12-13 | Certificate expires | ⏰ Upcoming |

## Support

For issues not covered in troubleshooting:

1. Check `.logs/` for previous solutions
2. Review documentation in `docs/` and `deploy/fleet-telemetry/README.md`
3. Consult Tesla Fleet Telemetry official docs
4. Document the issue and add it to `.logs/` for future reference

