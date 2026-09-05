#!/usr/bin/env bash
# Manual deploy: Cloud Run API + optional Firebase Hosting.
# Requires: setup-secrets.sh completed, gcloud authenticated.
#
# Usage:
#   export GCP_PROJECT_ID=your-project-id
#   export GCP_REGION=asia-south1
#   export PUBLIC_BILL_API_BASE=https://api.yourdomain.com
#   ./infra/gcp/deploy-manual.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${GCP_SERVICE:-craftguru-api}"
AR_REPO="${GCP_AR_REPO:-craftguru}"
PUBLIC_BILL_API_BASE="${PUBLIC_BILL_API_BASE:-}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Set GCP_PROJECT_ID."
  exit 1
fi

gcloud config set project "$PROJECT_ID"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> Building and deploying API (Cloud Build → Cloud Run); image tag will be the Cloud Build BUILD_ID..."
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=${REGION},_SERVICE=${SERVICE},_AR_REPO=${AR_REPO},_MIN_INSTANCES=1" \
  .

RUN_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo ""
echo "API deployed: $RUN_URL"
echo "Health check: ${RUN_URL}/health"
echo "Detailed:     ${RUN_URL}/api/health"

if [[ -x "$(dirname "$0")/post-deploy-update-origins.sh" ]]; then
  echo ""
  echo "==> Updating ALLOWED_ORIGIN for parallel testing..."
  GCP_PROJECT_ID="$PROJECT_ID" GCP_REGION="$REGION" GCP_SERVICE="$SERVICE" \
    "$(dirname "$0")/post-deploy-update-origins.sh"
fi

if [[ -n "$PUBLIC_BILL_API_BASE" ]]; then
  echo ""
  echo "==> Patching HTML and deploying Firebase Hosting..."
  export PUBLIC_BILL_API_BASE
  node tools/set-bill-api-base.js
  if command -v firebase >/dev/null 2>&1; then
    firebase deploy --only hosting --project "$PROJECT_ID" --non-interactive
  else
    echo "Install Firebase CLI: npm i -g firebase-tools"
    echo "Then: firebase deploy --only hosting --project $PROJECT_ID"
  fi
else
  echo ""
  echo "Set PUBLIC_BILL_API_BASE=$RUN_URL (or api subdomain) before Firebase deploy."
fi

echo ""
echo "Post-deploy:"
echo "  1. Map custom domain: gcloud run domain-mappings create --service=$SERVICE --domain=api.yourdomain.com --region=$REGION"
echo "  2. Update ALLOWED_ORIGIN in infra/gcp/env.cloudrun.yaml and redeploy if needed"
echo "  3. Point Cloudflare DNS: api → Cloud Run, www → Firebase Hosting"
