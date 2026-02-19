#!/bin/bash

# Deploy script for Artifactuse Panels
# Deploys built artifacts to CDN

set -e

CDN_BUCKET="${CDN_BUCKET:-artifactuse-cdn}"
CDN_URL="${CDN_URL:-https://cdn.artifactuse.com}"

echo "🚀 Deploying Artifactuse Panels to CDN..."

# Build all packages
echo "📦 Building packages..."
npm run build

# Deploy editor panel (contains video and canvas)
echo "📤 Deploying editor-panel..."
if [ -d "packages/editor-panel/dist" ]; then
  aws s3 sync packages/editor-panel/dist s3://$CDN_BUCKET/editor-panel --delete
  echo "  ✓ editor-panel deployed (video + canvas)"
else
  echo "  ⚠ editor-panel/dist not found, skipping"
fi

# Deploy standard panels
PANELS=(
  "code-panel"
  "json-panel"
  "svg-panel"
  "diff-panel"
  "html-panel"
  "react-panel"
  "vue-panel"
  "form-panel"
  "sheet-panel"
)

for panel in "${PANELS[@]}"; do
  if [ -d "packages/$panel/dist" ]; then
    echo "📤 Deploying $panel..."
    aws s3 sync packages/$panel/dist s3://$CDN_BUCKET/$panel --delete
    echo "  ✓ $panel deployed"
  else
    echo "  ⚠ $panel/dist not found, skipping"
  fi
done

# Invalidate CloudFront cache (optional)
if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  echo "🔄 Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
    --paths "/*"
fi

echo ""
echo "✅ Deployment complete!"
echo "📍 CDN URL: $CDN_URL"
echo ""
echo "Available panels:"
echo "  - $CDN_URL/editor-panel/video/   (Video Editor)"
echo "  - $CDN_URL/editor-panel/canvas/  (Canvas Editor)"
echo "  - $CDN_URL/code-panel/"
echo "  - $CDN_URL/json-panel/"
echo "  - $CDN_URL/svg-panel/"
echo "  - $CDN_URL/diff-panel/"
echo "  - $CDN_URL/html-panel/"
echo "  - $CDN_URL/react-panel/"
echo "  - $CDN_URL/vue-panel/"
echo "  - $CDN_URL/form-panel/"
echo "  - $CDN_URL/sheet-panel/"
