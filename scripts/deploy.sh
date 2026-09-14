#!/bin/bash

# Tesla App Deployment Script
# Syncs local code to VM and deploys automatically

set -e

# Configuration
VM_USER="${VM_USER:-ubuntu}"
VM_HOST="${VM_HOST:-app.omelenetskiy.xyz}"
VM_PATH="${VM_PATH:-/home/ubuntu/TeslaApp}"
TELEMETRY_HOST="${TELEMETRY_HOST:-telemetry.omelenetskiy.xyz}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check requirements
check_requirements() {
    log_info "Checking requirements..."

    if ! command -v rsync &> /dev/null; then
        log_error "rsync not found. Please install it."
        exit 1
    fi

    if ! command -v ssh &> /dev/null; then
        log_error "ssh not found."
        exit 1
    fi

    if [ ! -f "$SSH_KEY" ]; then
        log_error "SSH key not found at $SSH_KEY"
        exit 1
    fi

    log_success "All requirements met"
}

# Test SSH connection
test_connection() {
    log_info "Testing SSH connection to $VM_USER@$VM_HOST..."

    if ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$VM_USER@$VM_HOST" "echo 'Connection OK'" &> /dev/null; then
        log_success "SSH connection established"
    else
        log_error "Cannot connect to VM. Check SSH_KEY, VM_HOST, and VM_USER."
        exit 1
    fi
}

# Sync code to VM using rsync
sync_to_vm() {
    log_info "Syncing code to VM ($VM_USER@$VM_HOST:$VM_PATH)..."

    rsync -avz \
        --delete \
        --exclude='.next' \
        --exclude='node_modules' \
        --exclude='.env.local' \
        --exclude='.env' \
        --exclude='.git' \
        --exclude='dist' \
        --exclude='.DS_Store' \
        -e "ssh -i $SSH_KEY" \
        . "$VM_USER@$VM_HOST:$VM_PATH/"

    log_success "Code synced to VM"
}

# Build and restart services on VM
build_on_vm() {
    log_info "Building on VM..."

    ssh -i "$SSH_KEY" "$VM_USER@$VM_HOST" bash -c "
        set -e
        cd $VM_PATH

        # Install/update dependencies
        npm ci --prefer-offline --no-audit

        # Build Next.js app
        npm run build

        # Stop existing PM2 process if running
        pm2 stop TeslaApp 2>/dev/null || true

        # Start app with PM2
        pm2 start 'npm start' --name TeslaApp --cwd $VM_PATH
        pm2 save

        echo 'Build and restart complete'
    "

    log_success "Build complete on VM"
}

# Verify telemetry
verify_telemetry() {
    log_info "Verifying telemetry status..."

    ssh -i "$SSH_KEY" "$VM_USER@$VM_HOST" bash -c "
        cd $VM_PATH
        docker ps | grep fleet-telemetry || echo 'Warning: fleet-telemetry container not found'
    "
}

# Show deployment summary
show_summary() {
    log_info "Deployment Summary"
    echo "  VM Host: $VM_USER@$VM_HOST"
    echo "  VM Path: $VM_PATH"
    echo "  App URL: https://$VM_HOST"
    echo "  Telemetry: https://$TELEMETRY_HOST"
    echo ""
    echo "Next steps:"
    echo "  1. Check VM status: ssh -i $SSH_KEY $VM_USER@$VM_HOST pm2 status"
    echo "  2. View logs: ssh -i $SSH_KEY $VM_USER@$VM_HOST pm2 logs TeslaApp"
    echo "  3. View telemetry: ssh -i $SSH_KEY $VM_USER@$VM_HOST docker compose -f deploy/fleet-telemetry/docker-compose.sni-router.yml logs -f"
}

# Main deployment flow
main() {
    echo ""
    log_info "🚀 Starting Tesla App Deployment"
    echo ""

    # Parse arguments
    DRY_RUN=false
    SKIP_BUILD=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dry-run       Show what would be deployed without making changes"
                echo "  --skip-build    Skip building on VM (only sync code)"
                echo "  --help          Show this help message"
                echo ""
                echo "Environment variables:"
                echo "  VM_USER         SSH user (default: ubuntu)"
                echo "  VM_HOST         VM hostname (default: app.omelenetskiy.xyz)"
                echo "  VM_PATH         Remote path (default: /home/ubuntu/TeslaApp)"
                echo "  SSH_KEY         SSH key path (default: ~/.ssh/id_rsa)"
                echo "  TELEMETRY_HOST  Telemetry host (default: telemetry.omelenetskiy.xyz)"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    check_requirements
    test_connection

    if [ "$DRY_RUN" = true ]; then
        log_warn "DRY RUN MODE - No changes will be made"
        echo ""
        log_info "Would sync to: $VM_USER@$VM_HOST:$VM_PATH"
        log_info "Would build on VM"
        exit 0
    fi

    sync_to_vm

    if [ "$SKIP_BUILD" = false ]; then
        build_on_vm
        verify_telemetry
    else
        log_warn "Skipped build step"
    fi

    show_summary

    echo ""
    log_success "✨ Deployment complete!"
}

main "$@"

