#!/bin/bash

# Deploy Artifactuse Panels to Cloudflare Workers
#
# Usage:
#   ./scripts/deploy-cloudflare.sh                      # Deploy to production
#   ENVIRONMENT=staging ./scripts/deploy-cloudflare.sh  # Deploy to staging
#
# Requirements:
#   - wrangler CLI (installed automatically if missing)
#   - Cloudflare account (wrangler login)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

ENVIRONMENT="${ENVIRONMENT:-production}"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       🚀 Artifactuse Panels → Cloudflare Workers         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo ""

# Check for wrangler
if ! command -v wrangler &> /dev/null; then
  echo -e "${YELLOW}📦 Wrangler CLI not found. Installing...${NC}"
  npm install -g wrangler
fi

# Check Cloudflare auth
echo -e "${BLUE}🔐 Checking Cloudflare authentication...${NC}"
if ! wrangler whoami &> /dev/null; then
  echo -e "${YELLOW}   Not logged in. Running 'wrangler login'...${NC}"
  wrangler login
fi
echo -e "${GREEN}   ✓ Authenticated${NC}"

# Build all packages
echo ""
echo -e "${BLUE}📦 Building packages...${NC}"
npm run build

# Prepare worker dist
echo ""
echo -e "${BLUE}📁 Preparing distribution...${NC}"
rm -rf worker/dist
mkdir -p worker/dist

# Panels to deploy
PANELS=(
  "json-panel"
  "svg-panel"
  "diff-panel"
  "html-panel"
  "react-panel"
  "vue-panel"
  "form-panel"
  "sheet-panel"
  "code-panel"
  "editor-panel"
)

DEPLOYED=0
SKIPPED=0

for panel in "${PANELS[@]}"; do
  if [ -d "packages/$panel/dist" ]; then
    cp -r "packages/$panel/dist" "worker/dist/$panel"
    echo -e "   ${GREEN}✓${NC} $panel"
    ((DEPLOYED++))
  else
    echo -e "   ${DIM}○ $panel (not built)${NC}"
    ((SKIPPED++))
  fi
done

echo ""
echo -e "   Panels: ${GREEN}$DEPLOYED ready${NC}, ${DIM}$SKIPPED skipped${NC}"

# Copy worker public files (favicon, etc.)
if [ -d "worker/public" ]; then
  cp -r worker/public/* worker/dist/
  echo "   ✓ public files"
fi

# Deploy to Cloudflare
echo ""
echo -e "${BLUE}☁️  Deploying to Cloudflare Workers...${NC}"

cd worker

case "$ENVIRONMENT" in
  production)
    echo -e "   ${YELLOW}→ PRODUCTION${NC}"
    wrangler deploy --env production
    ;;
  staging)
    echo -e "   ${YELLOW}→ STAGING${NC}"
    wrangler deploy --env staging
    ;;
  *)
    echo -e "   ${YELLOW}→ DEVELOPMENT${NC}"
    wrangler deploy
    ;;
esac

cd ..

# Success
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                ✅ Deployment Complete                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Panels deployed:${NC}"
echo ""
echo "    /json-panel/   /svg-panel/    /diff-panel/"
echo "    /html-panel/   /react-panel/  /vue-panel/"
echo "    /form-panel/   /sheet-panel/  /code-panel/"
echo "    /editor-panel/"
echo ""
echo -e "${CYAN}Useful commands:${NC}"
echo ""
echo "  npm run cf:dev    Local dev server (http://localhost:8787)"
echo "  npm run cf:tail   Stream live logs from edge"
echo ""
