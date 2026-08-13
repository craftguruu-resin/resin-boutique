#!/usr/bin/env bash
# Append Cloud Run service URL to ALLOWED_ORIGIN after first deploy (parallel testing).
#
# Usage:
#   export GCP_PROJECT_ID=craft-guru-production
#   ./infra/gcp/post-deploy-update-origins.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-craft-guru-production}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${GCP_SERVICE:-craftguru-api}"

gcloud config set project "$PROJECT_ID"

RUN_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
if [[ -z "$RUN_URL" ]]; then
  echo "Cloud Run service $SERVICE not found in $REGION."
  exit 1
fi

CURRENT="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='yaml(spec.template.spec.containers[0].env)' | grep -A1 'name: ALLOWED_ORIGIN' | tail -1 | sed 's/.*value: //' || true)"

BASE_ORIGINS="https://www.craftguru.co.in,https://craftguru.co.in,https://www.craftguruindia.com,https://craftguruindia.com,https://craft-guru-production.web.app,https://craft-guru-production.firebaseapp.com"

echo "Updating ALLOWED_ORIGIN to include: $RUN_URL"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_ENV="$(mktemp)"
cp "$ROOT/infra/gcp/env.cloudrun.yaml" "$TMP_ENV"
# Replace ALLOWED_ORIGIN line with base list + Cloud Run URL (preserve all other env keys).
NEW_LINE="ALLOWED_ORIGIN: \"${BASE_ORIGINS},${RUN_URL}\""
if grep -q '^ALLOWED_ORIGIN:' "$TMP_ENV"; then
  sed -i.bak "s|^ALLOWED_ORIGIN:.*|${NEW_LINE}|" "$TMP_ENV" && rm -f "${TMP_ENV}.bak"
else
  printf '%s\n' "$NEW_LINE" >> "$TMP_ENV"
fi
gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --env-vars-file="$TMP_ENV"
rm -f "$TMP_ENV"

echo "Done. CORS now allows storefront on Cloud Run URL for parallel testing."
