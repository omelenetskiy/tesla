# Agent Instructions for DriveScope Deployment

This document guides AI agents (Copilot, Claude, etc.) through the DriveScope telemetry deployment and maintenance tasks.

## Quick Reference

### Architecture
- **Frontend**: Next.js app on the Oracle VM → `app.omelenetskiy.xyz` (served via PM2 process `TeslaApp` behind nginx; deployed with `scripts/deploy.sh`, not Netlify)
- **Backend**: Tesla Fleet Telemetry receiver on Oracle VM → `telemetry.omelenetskiy.xyz`
- **VM IP**: 130.61.30.119 (public)
- **VM Role**: Hosts both the frontend app and the telemetry receiver

### SSH Access
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
```

### Key Directories
- **Local project**: `/Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp`
- **VM project**: `/home/ubuntu/TeslaApp`
- **Telemetry config**: `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/`
- **Fleet Telemetry certs**: `/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/`

## Common Tasks

### 1. Check Telemetry Receiver Status
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose ps'
```

Expected output:
```
NAME                            COMMAND               STATE   PORTS
fleet-telemetry_fleet-telemetry_1   /fleet-telemetry...   Up
```

### 2. View Telemetry Logs
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose logs -f'
```

### 3. Restart Telemetry Service
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemctl restart fleet-telemetry.service'
```

### 4. Verify HTTPS Connectivity
```bash
curl -I https://telemetry.omelenetskiy.xyz/
# Should return a response from the telemetry server, not an error
```

### 5. Renew TLS Certificate
The certificate is valid until 2026-12-13. To renew early:
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo certbot renew --dry-run'
```

If ready to renew (not dry run):
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo certbot renew && sudo systemctl restart fleet-telemetry.service'
```

### 6. Check Certificate Details
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo openssl x509 -in /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem -text -noout | grep -A2 "Validity"'
```

## Deployment Workflow

### Initial Deployment (Already Completed)
This was completed on 2026-09-14. Reference: `.logs/2026-09-14-telemetry-setup.md`

1. ✅ Frontend and telemetry both running on the Oracle VM (PM2 + Docker)
2. ✅ Issued TLS certificate via Let's Encrypt
3. ✅ Fixed docker-compose configuration
4. ✅ Started Fleet Telemetry receiver
5. ✅ Updated documentation

### Next Steps (Post-Telemetry-Startup)

#### Step 1: Test HTTPS Connectivity
```bash
curl -I https://telemetry.omelenetskiy.xyz/
# Verify successful TLS handshake and HTTP response
```

#### Step 2: Configure Vehicle Telemetry
Run on the VM:
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
   node --loader ts-node/esm configure-vehicle.mts \
     --hostname=telemetry.omelenetskiy.xyz \
     --port=443'
```

#### Step 3: Authorize Key Pairing
1. Have the Tesla vehicle owner go to: `https://tesla.com/_ak/omelenetskiy.xyz`
2. Follow the on-screen instructions to authorize key pairing
3. The car will confirm the key via the telemetry server

#### Step 4: Verify Sync Status
Re-run the configuration script to verify the key is paired:
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
   node --loader ts-node/esm configure-vehicle.mts \
     --hostname=telemetry.omelenetskiy.xyz \
     --port=443'
```

## Troubleshooting

### Problem: Telemetry Container Won't Start
```bash
# Check logs
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose logs'

# Check config file exists and is readable
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cat /etc/fleet-telemetry/config.json'

# Verify certs exist
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'ls -la /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/'
```

### Problem: TLS Certificate Expired
If the certificate expires:
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemctl stop nginx && \
   sudo certbot certonly --standalone -d telemetry.omelenetskiy.xyz && \
   sudo systemctl start nginx && \
   sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/fullchain.pem /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/ && \
   sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/privkey.pem /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/ && \
   sudo chown ubuntu:ubuntu /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/* && \
   sudo systemctl restart fleet-telemetry.service'
```

### Problem: HTTPS Connection Fails
1. Verify DNS: `nslookup telemetry.omelenetskiy.xyz`
2. Verify certificate: `openssl s_client -connect telemetry.omelenetskiy.xyz:443 -showcerts`
3. Verify firewall: Ensure port 443 is open on the Oracle VM
4. Check nginx: `sudo systemctl status nginx` - should be `active`

## File Structure

```
.github/
├── AGENT_INSTRUCTIONS.md  (this file)
├── DEPLOYMENT_RUNBOOK.md  (step-by-step procedures)
└── TROUBLESHOOTING.md     (detailed troubleshooting guide)

.logs/
└── 2026-09-14-telemetry-setup.md  (session logs)

deploy/fleet-telemetry/
├── docker-compose.yml      (container config)
├── config.local.json       (telemetry receiver config)
├── configure-vehicle.mts   (vehicle configuration script)
├── certs/
│   ├── fullchain.pem       (Let's Encrypt certificate chain)
│   └── privkey.pem         (ECDSA private key)
└── README.md              (fleet-telemetry specific docs)
```

## Important Notes for Agents

1. **The frontend runs on this VM, not Netlify**: `app.omelenetskiy.xyz` is served by the `TeslaApp` PM2 process on this VM. Deploy it with `bash scripts/deploy.sh` (rsync + `npm ci && npm run build` + PM2 restart on the VM).
2. **Always verify before deploying**: Run verification checks after any change.
3. **Update logs**: After completing a task, add an entry to `.logs/` documenting what was done.
4. **Check DNS before issuing certificates**: Verify DNS resolves to the correct IP before ACME challenges.
5. **Preserve systemd service**: The `fleet-telemetry.service` ensures the receiver survives reboots.
6. **Document certificate renewals**: When renewing, note the date and new expiration in the logs.

## References

- **Main README**: `README.md` - Project overview and architecture
- **Setup Guide**: `SETUP_RU.md` - Russian deployment instructions
- **Next Steps**: `docs/next-steps-oracle-telemetry.md` - Telemetry-specific next steps
- **VM Connection**: `docs/vm-connection.md` - VM setup and connection reference
- **Fleet Telemetry Docs**: `deploy/fleet-telemetry/README.md` - Telemetry server details

