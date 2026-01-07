#!/bin/bash

# Deploy Artifactuse Panels to Cloudflare Workers

set -e

ENVIRONMENT="${ENVIRONMENT:-production}"

echo ""
echo "🚀 Deploying Artifactuse Panels to Cloudflare"
echo "   Environment: $ENVIRONMENT"
echo ""

# Check wrangler
if ! command -v wrangler &> /dev/null; then
  echo "📦 Installing Wrangler..."
  npm install -g wrangler
fi

# Check auth
if ! wrangler whoami &> /dev/null; then
  echo "🔐 Please login to Cloudflare..."
  wrangler login
fi

# Build
echo "📦 Building packages..."
npm run build

# Prepare dist
echo "📁 Preparing distribution..."
rm -rf worker/dist
mkdir -p worker/dist

for panel in json-panel svg-panel diff-panel html-panel react-panel vue-panel form-panel; do
  if [ -d "packages/$panel/dist" ]; then
    cp -r "packages/$panel/dist" "worker/dist/$panel"
    echo "   ✓ $panel"
  fi
done

# Copy worker public files (favicon, etc.)
if [ -d "worker/public" ]; then
  cp -r worker/public/* worker/dist/
  echo "   ✓ public files"
fi

# Deploy
echo ""
echo "☁️  Deploying..."
cd worker

case "$ENVIRONMENT" in
  production) wrangler deploy --env production ;;
  staging)    wrangler deploy --env staging ;;
  *)          wrangler deploy ;;
esac

echo ""
echo "✅ Done!"
echo ""