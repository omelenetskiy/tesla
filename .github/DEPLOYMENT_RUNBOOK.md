# DriveScope Deployment Runbook

Complete step-by-step procedures for deploying and maintaining the DriveScope system.

## Prerequisites Checklist
- [ ] SSH key exists: `~/.ssh/ubuntu-ssh-key-2026-09-14.key`
- [ ] SSH key permissions: 600 (run `chmod 600 ~/.ssh/ubuntu-ssh-key-2026-09-14.key`)
- [ ] Domain DNS resolves: `telemetry.omelenetskiy.xyz` → `130.61.30.119`
- [ ] Netlify frontend deployed: `app.omelenetskiy.xyz`
- [ ] Tesla Partner account configured
- [ ] Tesla Fleet credentials obtained

## Full Deployment Workflow

### Phase 1: Initial Setup (Completed 2026-09-14)

This phase separates the frontend (Netlify) from backend (VM telemetry).

#### 1.1 Verify VM Connectivity
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 'echo "✓ VM accessible"'
```

Expected: `✓ VM accessible`

#### 1.2 Stop Old Frontend Service
On the VM, disable any old Next.js service that was running:
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemctl stop drivescope.service || true; \
   sudo systemctl disable drivescope.service || true; \
   echo "✓ Old service stopped"'
```

#### 1.3 Update nginx to Serve Neutral Response
Replace nginx config to not proxy the frontend:
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo tee /etc/nginx/sites-available/default > /dev/null << EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        return 200 "DriveScope telemetry host";
        add_header Content-Type "text/plain";
    }
}
EOF
sudo systemctl restart nginx
echo "✓ nginx updated"'
```

#### 1.4 Verify Telemetry Project on VM
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'test -d /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
   echo "✓ Telemetry project exists" || echo "✗ Project missing"'
```

Expected: `✓ Telemetry project exists`

### Phase 2: Certificate Issuance (Completed 2026-09-14)

This phase obtains a public TLS certificate for mTLS.

#### 2.1 Verify DNS Resolution
```bash
nslookup telemetry.omelenetskiy.xyz
# Should resolve to 130.61.30.119
```

#### 2.2 Check Certificate Not Already Present
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'ls -la /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/ 2>/dev/null || echo "No certs yet"'
```

#### 2.3 Issue Certificate via Certbot
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
set -e
echo "Stopping nginx for ACME challenge..."
sudo systemctl stop nginx

echo "Issuing certificate..."
sudo certbot certonly \
  --standalone \
  --agree-tos \
  --no-eff-email \
  --email admin@omelenetskiy.xyz \
  -d telemetry.omelenetskiy.xyz

echo "Copying certificate to fleet-telemetry..."
mkdir -p /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs
sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/fullchain.pem \
  /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/
sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/privkey.pem \
  /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/
sudo chown ubuntu:ubuntu /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/*

echo "Restarting nginx..."
sudo systemctl start nginx

echo "✓ Certificate issued and copied"
openssl x509 -in /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem \
  -noout -dates
SCRIPT
```

### Phase 3: Docker-Compose Configuration (Completed 2026-09-14)

This phase deploys the telemetry receiver container.

#### 3.1 Fix docker-compose.yml for Host Network Mode
Ensure the file has `network_mode: host` and NO `ports` section (they're incompatible):
```bash
cat /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/docker-compose.yml
```

The file should look like:
```yaml
services:
  fleet-telemetry:
    image: tesla/fleet-telemetry:v0.9.4
    command: ["/fleet-telemetry", "-config=/etc/fleet-telemetry/config.json"]
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./config.local.json:/etc/fleet-telemetry/config.json:ro
      - ./certs:/etc/fleet-telemetry/certs:ro
```

#### 3.2 Deploy docker-compose.yml to VM
```bash
scp -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key \
  /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/deploy/fleet-telemetry/docker-compose.yml \
  ubuntu@130.61.30.119:/home/ubuntu/TeslaApp/deploy/fleet-telemetry/docker-compose.yml
echo "✓ Deployed docker-compose.yml"
```

### Phase 4: Systemd Service Setup (Completed 2026-09-14)

This phase creates a systemd service to manage the telemetry receiver.

#### 4.1 Create Service Unit File
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
sudo tee /etc/systemd/system/fleet-telemetry.service > /dev/null << 'EOF'
[Unit]
Description=Tesla Fleet Telemetry receiver
After=network.target docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/home/ubuntu/TeslaApp/deploy/fleet-telemetry
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
RemainAfterExit=yes
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable fleet-telemetry.service
echo "✓ Service unit created"
SCRIPT
```

### Phase 5: Start Telemetry Receiver

#### 5.1 Start the Service
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemctl start fleet-telemetry.service && \
   echo "✓ Service started"'
```

#### 5.2 Verify Service Status
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
echo "=== Systemd Service Status ==="
sudo systemctl status fleet-telemetry.service --no-pager | head -20

echo ""
echo "=== Docker Container Status ==="
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
docker-compose ps

echo ""
echo "=== Container Logs (last 10 lines) ==="
docker-compose logs --tail=10
SCRIPT
```

Expected output:
```
=== Systemd Service Status ===
● fleet-telemetry.service - Tesla Fleet Telemetry receiver
     Loaded: loaded (/etc/systemd/system/fleet-telemetry.service; enabled; vendor preset: enabled)
     Active: active (exited) since Mon 2026-09-14 08:39:35 UTC
```

#### 5.3 Test HTTPS Connectivity
```bash
curl -I https://telemetry.omelenetskiy.xyz/
```

Expected: HTTP 200 or similar response (NOT a TLS error)

### Phase 6: Vehicle Configuration

#### 6.1 Run Vehicle Configuration Script
On the VM:
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
node --loader ts-node/esm configure-vehicle.mts \
  --hostname=telemetry.omelenetskiy.xyz \
  --port=443
SCRIPT
```

This script will:
- Generate cryptographic keys
- Register the public key with Tesla
- Output an authorization URL

#### 6.2 Authorize Key Pairing
1. Save the authorization URL from the previous step
2. Have a Tesla vehicle owner open it in a web browser
3. Confirm the pairing on the vehicle or through the Tesla app
4. The vehicle will now send telemetry to your receiver

#### 6.3 Verify Sync Status
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry
node --loader ts-node/esm configure-vehicle.mts \
  --hostname=telemetry.omelenetskiy.xyz \
  --port=443
# Should show successful sync status
SCRIPT
```

## Maintenance Tasks

### Weekly: Check Certificate Expiry
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'openssl x509 -in /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem -noout -dates'
```

### Monthly: Test Container Restart
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
   docker-compose restart fleet-telemetry && \
   sleep 5 && \
   docker-compose ps'
```

### Quarterly: Renew Certificate (if close to expiry)
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
sudo systemctl stop nginx
sudo certbot renew
sudo systemctl start nginx
sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/fullchain.pem \
  /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/
sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/privkey.pem \
  /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/
sudo chown ubuntu:ubuntu /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/*
sudo systemctl restart fleet-telemetry.service
echo "✓ Certificate renewed"
SCRIPT
```

## Rollback Procedure

If telemetry needs to be taken offline:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemctl stop fleet-telemetry.service && \
   cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
   docker-compose down && \
   echo "✓ Telemetry receiver stopped"'
```

To bring it back online:

```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemctl start fleet-telemetry.service && \
   sleep 5 && \
   cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
   docker-compose ps'
```

## Logging

After any operation, document the outcome in `.logs/`:

```bash
cat >> /Users/Aleksandr_Omelenetskiy/Projects/Tesla/TeslaApp/.logs/operations.log << EOF
[$(date -u +%Y-%m-%d\ %H:%M:%S\ UTC)] Operation: <description>
Status: ✓ Success / ✗ Failed
Details: <any relevant info>
EOF
```

