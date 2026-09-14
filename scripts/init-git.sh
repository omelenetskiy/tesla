#!/bin/bash

# Initialize Git repository and create initial commit

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Check if git is already initialized
if [ -d .git ]; then
    log_success "Git repository already initialized"

    # Show git status
    echo ""
    log_info "Current git status:"
    git status

    # Offer to create commit
    echo ""
    read -p "Create a new commit? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Commit message: " message
        git add -A
        git commit -m "$message"
        log_success "Commit created"
    fi
    exit 0
fi

log_info "Initializing Git repository..."

# Initialize git
git init
log_success "Git repository initialized"

# Create .gitignore if not exists
if [ ! -f .gitignore ]; then
    log_info "Creating .gitignore..."
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
/.pnp
.pnp.js

# Testing
/coverage

# Next.js
/.next/
/out/

# Production
/build
/dist

# Misc
.DS_Store
*.pem
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
Thumbs.db

# Local files
.config.local.json
skills-lock.json
EOF
    log_success ".gitignore created"
fi

# Add all files
log_info "Adding files to git..."
git add -A
log_success "Files added"

# Create initial commit
log_info "Creating initial commit..."
git commit -m "Initial commit: Tesla Fleet Telemetry App with comprehensive telemetry monitoring and VM deployment system"
log_success "Initial commit created"

# Show git log
echo ""
log_info "Git log:"
git log --oneline -n 1

echo ""
echo "Next steps:"
echo "  1. Add remote: git remote add origin <repository-url>"
echo "  2. Push commits: git push -u origin main"
echo "  3. Deploy to VM: bash scripts/deploy.sh"

