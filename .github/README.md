# .github — Agent Instructions & Documentation

This folder contains comprehensive instructions for AI agents (Copilot, Claude, etc.) and automated systems to deploy, maintain, and troubleshoot the DriveScope application.

## Files

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
1. Initial Setup (frontend/backend separation)
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

```
┌─────────────────────────────────────────────────────────┐
│                   DriveScope System                      │
├────────────────────┬────────────────────────────────────┤
│   Frontend         │         Backend                    │
│   (Netlify)        │    (Oracle VM 130.61.30.119)      │
├────────────────────┼────────────────────────────────────┤
│                    │                                    │
│ app.omelenetskiy   │ telemetry.omelenetskiy.xyz        │
│ .xyz               │ - Port 443 (HTTPS/mTLS)           │
│                    │ - Port 9090 (metrics)             │
│ ✓ Next.js app     │ ✓ Fleet Telemetry receiver        │
│ ✓ Vehicle UI      │ ✓ Certificate issued              │
│ ✓ Login flow      │ ✓ Docker container running        │
│ ✓ Dashboard       │ ✓ Systemd service autostart       │
│                    │                                    │
└────────────────────┴────────────────────────────────────┘
```

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

### 4. For Troubleshooting
→ See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## Important Rules for Agents

1. **Always verify before and after**: Run health checks before starting work and after finishing.

2. **Never change the architecture**: Frontend stays on Netlify, VM stays telemetry-only.

3. **Always use the SSH key**: 
   ```bash
   ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
   ```

4. **Document your work**: After completing a task, add an entry to `.logs/operations.log`.

5. **Test HTTPS connectivity**: Always verify `curl -I https://telemetry.omelenetskiy.xyz/` works.

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

## Critical Files

### Local (Laptop/Development)
- `.logs/` — Session logs and operation records
- `.github/` — Agent instructions (this folder)
- `README.md` — Project overview
- `SETUP_RU.md` — Russian setup guide
- `docs/next-steps-oracle-telemetry.md` — Telemetry next steps
- `docs/vm-connection.md` — VM connection reference
- `deploy/fleet-telemetry/` — Telemetry deployment files

### Remote (VM)
- `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/` — Active telemetry deployment
- `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/` — TLS certificates
- `/etc/fleet-telemetry/config.json` — Telemetry server config
- `/etc/systemd/system/fleet-telemetry.service` — Systemd service unit
- `/etc/letsencrypt/live/telemetry.omelenetskiy.xyz/` — Let's Encrypt certs

## Deployment Status

### Completed (September 14, 2026)
- ✅ Frontend/backend split (Netlify / Oracle VM)
- ✅ TLS certificate issued (Let's Encrypt ECDSA)
- ✅ Docker-compose configuration
- ✅ Systemd service setup
- ✅ Fleet Telemetry receiver running
- ✅ Documentation updated

### In Progress / Next
- 🔄 Vehicle telemetry configuration
- 🔄 Key pairing authorization
- 🔄 Automatic certificate renewal setup
- 🔄 Monitoring and alerting

## Monitoring Checklist

### Daily
- [ ] Check container status: `docker-compose ps`
- [ ] Check service status: `sudo systemctl status fleet-telemetry.service`

### Weekly
- [ ] Verify certificate validity (expires 2026-12-13)
- [ ] Check telemetry logs: `docker-compose logs --tail=50`

### Monthly
- [ ] Test container restart: `docker-compose restart`
- [ ] Verify HTTPS connectivity: `curl -I https://telemetry.omelenetskiy.xyz/`

### Quarterly
- [ ] Renew certificate if needed (before expiry)
- [ ] Review and update documentation

## Version History

| Date | What | Status |
|------|------|--------|
| 2026-09-14 | Initial telemetry setup | ✅ Complete |
| 2026-12-13 | Certificate expires | ⏰ Upcoming |

## Support

For issues not covered in troubleshooting:

1. Check `.logs/` for previous solutions
2. Review documentation in `docs/` and `deploy/fleet-telemetry/README.md`
3. Consult Tesla Fleet Telemetry official docs
4. Document the issue and add it to `.logs/` for future reference

