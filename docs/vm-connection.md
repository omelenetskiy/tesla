# VM connection notes for Copilot

Use this when reconnecting to the Oracle Cloud VM.

## Key facts
- VM public IP: `130.61.30.119`
- SSH user: `ubuntu`
- SSH private key: `~/.ssh/ubuntu-ssh-key-2026-09-14.key`
- OCI console connection OCID:
  `ocid1.instanceconsoleconnection.oc1.eu-frankfurt-1.antheljr74jhmvycm3zjcjksuluztrfu3maz7kkmzpojv2bid6zsnowmloka`
- OCI instance OCID:
  `ocid1.instance.oc1.eu-frankfurt-1.antheljr74jhmvyc5rasopi2e3xxvobk4l7wxncgzmikgqfx5h5p6n5ckspq`

## Direct SSH
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key ubuntu@130.61.30.119
```

## OCI console proxy SSH
Use this only if direct SSH is unavailable:
```bash
ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key \
  -o ProxyCommand='ssh -i ~/.ssh/ubuntu-ssh-key-2026-09-14.key -W %h:%p -p 443 ocid1.instanceconsoleconnection.oc1.eu-frankfurt-1.antheljr74jhmvycm3zjcjksuluztrfu3maz7kkmzpojv2bid6zsnowmloka@instance-console.eu-frankfurt-1.oci.oraclecloud.com' \
  ubuntu@130.61.30.119
```

## What worked during the last session
- Direct SSH to `ubuntu@130.61.30.119` succeeded.
- `sudo` is passwordless for `ubuntu`.
- Node.js and npm are installed on the VM.
- nginx is installed and active.
- Docker is installed; telemetry uses `docker-compose` on this VM.

## VM setup checklist
1. Connect with the direct SSH command above.
2. Verify `sudo -n true` works.
3. Keep the VM telemetry-only; do **not** proxy the frontend app from it.
4. Prepare telemetry certs and start `deploy/fleet-telemetry/docker-compose.yml`.
5. Keep nginx on the VM from redirecting to the app login page.

## Troubleshooting notes
- If the ProxyCommand gives `Unable to establish connection`, direct SSH may still work.
- If the OCI console connection times out, use the public IP SSH path first.
- The published Tesla public key file is already synchronized in the repo at:
  `public/.well-known/appspecific/com.tesla.3p.public-key.pem`
