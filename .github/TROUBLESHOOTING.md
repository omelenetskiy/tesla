# DriveScope Troubleshooting Guide

Comprehensive troubleshooting procedures for common DriveScope deployment issues.

## Quick Diagnostics

Run this to quickly assess system health:

```bash
#!/bin/bash

echo "🔍 DriveScope Health Check"
echo "================================"

# Check DNS
echo -n "1. DNS Resolution: "
if nslookup telemetry.omelenetskiy.xyz 2>/dev/null | grep -q "130.61.30.119"; then
    echo "✓"
else
    echo "✗ FAILED"
fi

# Check HTTPS
echo -n "2. HTTPS Connectivity: "
if curl -s -I https://telemetry.omelenetskiy.xyz/ 2>/dev/null | grep -q "200\|400\|500"; then
    echo "✓"
else
    echo "✗ FAILED"
fi

# Check SSH
echo -n "3. VM SSH Access: "
if ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key -o ConnectTimeout=5 ubuntu@130.61.30.119 'true' 2>/dev/null; then
    echo "✓"
else
    echo "✗ FAILED"
fi

# Check telemetry service
echo -n "4. Telemetry Service: "
STATUS=$(ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 'sudo systemctl is-active fleet-telemetry.service' 2>/dev/null)
if [ "$STATUS" = "active" ] || [ "$STATUS" = "inactive" ]; then
    echo "✓ (Status: $STATUS)"
else
    echo "✗ FAILED (Status: unknown)"
fi

# Check container
echo -n "5. Docker Container: "
CONTAINER=$(ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
    'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose ps -q fleet-telemetry 2>/dev/null' 2>/dev/null)
if [ -n "$CONTAINER" ]; then
    echo "✓ (Running)"
else
    echo "✗ FAILED (Not running)"
fi

echo ""
echo "================================"
echo "For detailed troubleshooting, see sections below."
```

## Category 1: DNS & Network Issues

### Problem: DNS doesn't resolve `telemetry.omelenetskiy.xyz`

**Symptoms:**
- `nslookup telemetry.omelenetskiy.xyz` returns NXDOMAIN
- `curl https://telemetry.omelenetskiy.xyz/` fails with "Name or service not known"

**Diagnosis:**
```bash
# Check DNS from local machine
nslookup telemetry.omelenetskiy.xyz
dig telemetry.omelenetskiy.xyz
getent hosts telemetry.omelenetskiy.xyz

# Check DNS from VM
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'nslookup telemetry.omelenetskiy.xyz'
```

**Solutions:**

**Option A: DNS Propagation Delay**
- Wait 24-48 hours for DNS to fully propagate
- Check status at: https://www.dnschecker.org/

**Option B: DNS Cache Issue**
```bash
# Flush local DNS cache (macOS)
sudo dscacheutil -flushcache

# Force curl to use specific DNS
curl --resolve telemetry.omelenetskiy.xyz:443:130.61.30.119 https://telemetry.omelenetskiy.xyz/
```

**Option C: Wrong DNS Records**
- Check your domain registrar (GoDaddy, Route53, etc.)
- Verify A record points to `130.61.30.119`
- Verify no CNAME or other records override it

---

## Category 2: TLS Certificate Issues

### Problem: Certificate Not Found or Expired

**Symptoms:**
- `curl https://telemetry.omelenetskiy.xyz/` returns: `SSL: CERTIFICATE_VERIFY_FAILED`
- `openssl s_client` shows old or missing certificate

**Diagnosis:**
```bash
# Check certificate validity
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'openssl x509 -in /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem -noout -dates'

# Check certificate subject
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'openssl x509 -in /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem -noout -subject'

# Verify cert matches private key
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
CERT_MODULUS=$(openssl x509 -in /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem -noout -modulus | md5sum)
KEY_MODULUS=$(openssl ec -in /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/privkey.pem -noout -text | md5sum)
if [ "$CERT_MODULUS" = "$KEY_MODULUS" ]; then
    echo "✓ Certificate and private key match"
else
    echo "✗ Certificate and private key DO NOT match"
fi
SCRIPT
```

**Solutions:**

**Option A: Certificate Expired (need renewal)**
```bash
# Verify expiry date
openssl x509 -in ~/.ssh/... -noout -dates

# If expired, renew immediately
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
sudo systemctl stop nginx
sudo certbot certonly --force-renewal -d telemetry.omelenetskiy.xyz --standalone
sudo systemctl start nginx
sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/fullchain.pem \
  /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/privkey.pem \
  /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/privkey.pem
sudo chown ubuntu:ubuntu /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/*
sudo systemctl restart fleet-telemetry.service
SCRIPT
```

**Option B: Certificate File Not Found**
```bash
# Check if cert directory exists
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'ls -la /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/'

# If not found, re-issue certificate
# Follow "Option A: Certificate Expired" above
```

**Option C: Cert Doesn't Match Domain**
```bash
# Check certificate subject
openssl x509 -in <cert-file> -noout -subject

# If it shows a different domain, you need to issue a new cert for telemetry.omelenetskiy.xyz
# Delete old cert and re-issue
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
sudo certbot delete --cert-name telemetry.omelenetskiy.xyz
sudo systemctl stop nginx
sudo certbot certonly -d telemetry.omelenetskiy.xyz --standalone
sudo systemctl start nginx
# ... continue with copying certs
SCRIPT
```

---

## Category 3: Docker Container Issues

### Problem: Container Won't Start

**Symptoms:**
- `docker-compose ps` shows container in `Exit` or `Error` state
- `docker-compose logs` shows error message

**Diagnosis:**
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry

echo "=== Container Status ==="
docker-compose ps

echo ""
echo "=== Container Logs ==="
docker-compose logs

echo ""
echo "=== Docker Image Check ==="
docker images | grep fleet-telemetry

echo ""
echo "=== Config File Check ==="
ls -la config.local.json
cat config.local.json | head -20
SCRIPT
```

**Solutions:**

**Option A: Config File Missing**
```bash
# Check if config exists
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'test -f /home/ubuntu/TeslaApp/deploy/fleet-telemetry/config.local.json && echo "✓ Found" || echo "✗ Missing"'

# If missing, you need to create it with valid Tesla Fleet credentials
# Refer to deploy/fleet-telemetry/README.md for config format
```

**Option B: Docker Image Not Found**
```bash
# Pull the correct image
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'docker pull tesla/fleet-telemetry:v0.9.4'

# Try starting again
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose up -d'
```

**Option C: Port Already In Use**
```bash
# Check what's listening on port 443
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo lsof -i :443'

# If something else is using port 443, either:
# 1. Stop the other service
# 2. Change fleet-telemetry to a different port
# 3. Use network_mode: bridge instead of host (less preferred)
```

**Option D: Certificate/Key Permission Error**
```bash
# Check cert permissions
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'ls -la /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/'

# Certs should be readable by the container user
# Fix permissions
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo chmod 644 /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/*'
```

---

## Category 4: Systemd Service Issues

### Problem: Systemd Service Won't Start

**Symptoms:**
- `sudo systemctl status fleet-telemetry.service` shows `inactive (dead)`
- Service fails to start on boot

**Diagnosis:**
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
echo "=== Service Status ==="
sudo systemctl status fleet-telemetry.service --no-pager

echo ""
echo "=== Service Logs ==="
sudo journalctl -u fleet-telemetry.service -n 50 --no-pager

echo ""
echo "=== Service File ==="
cat /etc/systemd/system/fleet-telemetry.service

echo ""
echo "=== Docker Installation ==="
which docker-compose
docker-compose --version
SCRIPT
```

**Solutions:**

**Option A: Service File Has Errors**
```bash
# Validate service file syntax
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemd-analyze verify /etc/systemd/system/fleet-telemetry.service'

# Recreate service file if needed
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
SCRIPT
```

**Option B: Docker Daemon Not Running**
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemctl status docker'

# If not running, start it
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo systemctl start docker && sudo systemctl enable docker'
```

**Option C: Working Directory Doesn't Exist**
```bash
# Check if directory exists
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'test -d /home/ubuntu/TeslaApp/deploy/fleet-telemetry && echo "✓" || echo "✗"'

# Create if missing
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'mkdir -p /home/ubuntu/TeslaApp/deploy/fleet-telemetry'
```

---

## Category 5: Network & Firewall Issues

### Problem: Can't Connect to HTTPS Port

**Symptoms:**
- `curl https://telemetry.omelenetskiy.xyz/` times out
- `telnet telemetry.omelenetskiy.xyz 443` fails

**Diagnosis:**
```bash
# Test local connectivity on VM
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
echo "=== Local port check ==="
sudo lsof -i :443
sudo lsof -i :9090

echo ""
echo "=== Firewall check ==="
sudo iptables -L -n | grep 443
sudo ufw status | grep 443

echo ""
echo "=== Network interface check ==="
ip addr show | grep "inet"
SCRIPT

# Test external connectivity
echo "Testing external connectivity..."
timeout 5 bash -c 'echo > /dev/tcp/130.61.30.119/443' && echo "✓ Port 443 is open" || echo "✗ Port 443 is closed"
```

**Solutions:**

**Option A: Firewall Blocking Port 443**
```bash
# Check Oracle Cloud firewall rules
# Usually in OCI console: Networking → Security Lists → Ingress Rules

# SSH to VM and check local firewall
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
sudo ufw status
# If ufw is active and 443 is blocked, allow it:
sudo ufw allow 443/tcp
sudo ufw allow 9090/tcp
SCRIPT
```

**Option B: Port Already In Use**
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo lsof -i :443'

# Kill the process using port 443
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'sudo kill -9 <PID>'

# Or change fleet-telemetry to use a different port
```

**Option C: Container Not Listening**
```bash
# Check what ports the container is actually listening on
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
  'docker-compose exec fleet-telemetry netstat -tuln'
```

---

## Category 6: Certificate Not Copied Issue (if it happens)

### Problem: Certs in `/etc/letsencrypt` but not in fleet-telemetry folder

**Symptoms:**
- `openssl x509 -in /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/fullchain.pem` works
- `openssl x509 -in /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem` fails
- Container can't read cert files

**Solution:**
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 << 'SCRIPT'
# Copy certs from Let's Encrypt to fleet-telemetry
sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/fullchain.pem \
  /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem

sudo cp /etc/letsencrypt/live/telemetry.omelenetskiy.xyz/privkey.pem \
  /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/privkey.pem

# Fix permissions
sudo chown ubuntu:ubuntu /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/*
sudo chmod 644 /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/*

# Verify
ls -la /home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/

# Restart container
sudo systemctl restart fleet-telemetry.service
SCRIPT
```

---

## Getting Help

If you've tried all solutions and issues persist:

1. **Gather diagnostic data:**
   ```bash
   ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119 \
     'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && \
      docker-compose logs > /tmp/telemetry-logs.txt && \
      sudo journalctl -u fleet-telemetry.service > /tmp/systemd-logs.txt'
   ```

2. **Document the issue:**
   - What command failed?
   - What error message was shown?
   - When did it last work?
   - What changed?

3. **Share information:**
   - Logs from step 1
   - Output of diagnostic scripts
   - Fleet Telemetry version and config

---

## Reference: Normal Outputs

### Healthy Service Status
```
● fleet-telemetry.service - Tesla Fleet Telemetry receiver
     Loaded: loaded (/etc/systemd/system/fleet-telemetry.service; enabled)
     Active: active (exited) since Mon 2026-09-14 08:39:35 UTC
```

### Healthy Container Status
```
NAME                            COMMAND               STATE   PORTS
fleet-telemetry_fleet-telemetry_1   /fleet-telemetry...   Up
```

### Healthy Certificate
```
Subject: CN = telemetry.omelenetskiy.xyz
Not Before: Sep 14 08:00:00 2026 GMT
Not After : Dec 13 08:00:00 2026 GMT
```

### Healthy HTTPS Test
```bash
$ curl -I https://telemetry.omelenetskiy.xyz/
HTTP/1.1 200 OK
Content-Type: application/json
```

