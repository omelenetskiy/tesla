#!/bin/bash

# DriveScope Health Check Script
# Quick diagnostic to verify system is functioning

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
SSH_KEY="$HOME/.ssh/ubuntu-ssh-key-2026-09-14.key"
VM_HOST="ubuntu@130.61.30.119"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}DriveScope Health Check${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Helper functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS_COUNT++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL_COUNT++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARN_COUNT++))
}

# 1. DNS Resolution
echo -e "${BLUE}1. DNS Resolution${NC}"
if nslookup telemetry.omelenetskiy.xyz 2>/dev/null | grep -q "130.61.30.119"; then
    check_pass "telemetry.omelenetskiy.xyz resolves to 130.61.30.119"
else
    check_fail "DNS resolution failed"
fi
echo ""

# 2. SSH Access
echo -e "${BLUE}2. SSH Access${NC}"
if [ ! -f "$SSH_KEY" ]; then
    check_fail "SSH key not found at $SSH_KEY"
else
    check_pass "SSH key exists"

    if ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$VM_HOST" 'true' 2>/dev/null; then
        check_pass "SSH connection successful"
    else
        check_fail "SSH connection failed"
    fi
fi
echo ""

# 3. HTTPS Connectivity
echo -e "${BLUE}3. HTTPS Connectivity${NC}"
if curl -s -I https://telemetry.omelenetskiy.xyz/ 2>/dev/null | head -1 | grep -q "HTTP"; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://telemetry.omelenetskiy.xyz/ 2>/dev/null)
    if [ "$HTTP_CODE" -lt 500 ]; then
        check_pass "HTTPS accessible (HTTP $HTTP_CODE)"
    else
        check_warn "HTTPS accessible but server error (HTTP $HTTP_CODE)"
    fi
else
    check_fail "HTTPS connection failed"
fi
echo ""

# 4. Telemetry Service Status
echo -e "${BLUE}4. Telemetry Service Status${NC}"
SERVICE_STATUS=$(ssh -i "$SSH_KEY" "$VM_HOST" 'sudo systemctl is-active fleet-telemetry.service 2>/dev/null' 2>/dev/null || echo "unknown")
if [ "$SERVICE_STATUS" = "active" ]; then
    check_pass "Service is active"
elif [ "$SERVICE_STATUS" = "inactive" ]; then
    check_warn "Service is inactive (not running)"
else
    check_fail "Could not determine service status"
fi
echo ""

# 5. Docker Container Status
echo -e "${BLUE}5. Docker Container Status${NC}"
CONTAINER_COUNT=$(ssh -i "$SSH_KEY" "$VM_HOST" \
    'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose ps -q 2>/dev/null | wc -l' \
    2>/dev/null || echo "0")
if [ "$CONTAINER_COUNT" -gt 0 ]; then
    CONTAINER_STATE=$(ssh -i "$SSH_KEY" "$VM_HOST" \
        'cd /home/ubuntu/TeslaApp/deploy/fleet-telemetry && docker-compose ps 2>/dev/null | grep -oP "Up|Exit" | head -1' \
        2>/dev/null || echo "unknown")
    if [ "$CONTAINER_STATE" = "Up" ]; then
        check_pass "Container is running"
    else
        check_warn "Container exists but not running (state: $CONTAINER_STATE)"
    fi
else
    check_fail "Container not found"
fi
echo ""

# 6. TLS Certificate
echo -e "${BLUE}6. TLS Certificate${NC}"
CERT_PATH="/home/ubuntu/TeslaApp/deploy/fleet-telemetry/certs/fullchain.pem"
CERT_EXISTS=$(ssh -i "$SSH_KEY" "$VM_HOST" "test -f $CERT_PATH && echo 'yes' || echo 'no'" 2>/dev/null)
if [ "$CERT_EXISTS" = "yes" ]; then
    check_pass "Certificate file exists"

    # Check expiry date
    EXPIRY=$(ssh -i "$SSH_KEY" "$VM_HOST" \
        "openssl x509 -in $CERT_PATH -noout -dates 2>/dev/null | grep 'notAfter' | cut -d= -f2" \
        2>/dev/null || echo "unknown")

    if [ -n "$EXPIRY" ] && [ "$EXPIRY" != "unknown" ]; then
        # Parse expiry date
        EXPIRY_EPOCH=$(date -j -f "%b %d %T %Y %Z" "$EXPIRY" +%s 2>/dev/null || echo "0")
        NOW_EPOCH=$(date +%s)
        DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

        if [ "$DAYS_UNTIL_EXPIRY" -gt 30 ]; then
            check_pass "Certificate valid until $EXPIRY ($DAYS_UNTIL_EXPIRY days remaining)"
        elif [ "$DAYS_UNTIL_EXPIRY" -gt 0 ]; then
            check_warn "Certificate expires soon: $EXPIRY ($DAYS_UNTIL_EXPIRY days remaining)"
        else
            check_fail "Certificate expired on $EXPIRY"
        fi
    else
        check_warn "Could not parse certificate expiry"
    fi
else
    check_fail "Certificate file not found at $CERT_PATH"
fi
echo ""

# 7. Project Files
echo -e "${BLUE}7. Project Files${NC}"
REQUIRED_FILES=(
    ".logs/2026-09-14-telemetry-setup.md"
    ".github/AGENT_INSTRUCTIONS.md"
    ".github/DEPLOYMENT_RUNBOOK.md"
    ".github/TROUBLESHOOTING.md"
    ".github/README.md"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
        check_pass "$file exists"
    else
        check_warn "$file not found"
    fi
done
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "Passed:  ${GREEN}$PASS_COUNT${NC}"
echo -e "Warnings: ${YELLOW}$WARN_COUNT${NC}"
echo -e "Failed:  ${RED}$FAIL_COUNT${NC}"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    if [ "$WARN_COUNT" -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed! System is healthy.${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠ System is operational but has warnings. See above for details.${NC}"
        exit 0
    fi
else
    echo -e "${RED}✗ System has failures. See above for details.${NC}"
    echo -e "${RED}For troubleshooting, see: .github/TROUBLESHOOTING.md${NC}"
    exit 1
fi

