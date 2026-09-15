#!/bin/bash

# Production Deployment Script
# Tesla App - September 2026

set -e

echo "🚀 Starting Tesla App Production Deployment"
echo "==========================================="

# Step 1: Build optimization
echo "📦 Step 1: Building application..."
npm run build
echo "✅ Build complete"

# Step 2: Run tests
echo "🧪 Step 2: Running tests..."
npm run test:unit
npm run test:integration
echo "✅ Tests passed"

# Step 3: Performance checks
echo "⚡ Step 3: Performance checks..."
npm run build:analyze
echo "✅ Performance verified"

# Step 4: Security audit
echo "🔒 Step 4: Security audit..."
npm audit --production
echo "✅ Security check passed"

# Step 5: Deploy to staging
echo "🔄 Step 5: Deploying to staging..."
npm run deploy:staging
echo "✅ Staging deployed"

# Step 6: Smoke tests on staging
echo "🔥 Step 6: Running smoke tests..."
npm run test:smoke -- --url https://staging.app.com
echo "✅ Smoke tests passed"

# Step 7: Deploy to production
echo "🌍 Step 7: Deploying to production..."
npm run deploy:production
echo "✅ Production deployed"

# Step 8: Monitor deployment
echo "📊 Step 8: Monitoring deployment..."
npm run monitor:deploy
echo "✅ Deployment monitoring active"

echo ""
echo "🎉 Production deployment complete!"
echo "App is live at: https://app.tesla.com"
echo ""
