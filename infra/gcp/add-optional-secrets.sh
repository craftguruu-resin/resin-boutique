#!/usr/bin/env bash
# Attach optional Secret Manager secrets to an existing Cloud Run service.
# Run after setup-secrets.sh if you created WhatsApp / bill API / OTP pepper secrets.
#
# Usage:
#   export GCP_PROJECT_ID=craft-guru-production
#   ./infra/gcp/add-optional-secrets.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-craft-guru-production}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${GCP_SERVICE:-craftguru-api}"

gcloud config set project "$PROJECT_ID"

SECRETS=""
append_secret() {
  local env_name="$1"
  local secret_name="$2"
  if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    if [[ -n "$SECRETS" ]]; then SECRETS="${SECRETS},"; fi
    SECRETS="${SECRETS}${env_name}=${secret_name}:latest"
    echo "  + $env_name"
  else
    echo "  skip $secret_name (not created)"
  fi
}

echo "Optional secrets to attach:"
append_secret WHATSAPP_ACCESS_TOKEN craftguru-whatsapp-access-token
append_secret WHATSAPP_PHONE_NUMBER_ID craftguru-whatsapp-phone-number-id
append_secret BILL_API_SECRET craftguru-bill-api-secret
append_secret GUEST_OTP_PEPPER craftguru-guest-otp-pepper
append_secret RAZORPAY_KEY_ID craftguru-razorpay-key-id
append_secret RAZORPAY_KEY_SECRET craftguru-razorpay-key-secret

if [[ -z "$SECRETS" ]]; then
  echo "No optional secrets found. Nothing to update."
  exit 0
fi

gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --update-secrets="$SECRETS"

echo "Done."
