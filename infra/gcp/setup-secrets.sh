#!/usr/bin/env bash
# Create or update Secret Manager secrets for Craftguru Cloud Run.
# Run once per GCP project. Requires: gcloud auth login, project set.
#
# Usage:
#   export GCP_PROJECT_ID=your-project-id
#   export DATABASE_URL='postgresql://...'   # optional: set env vars before run
#   ./infra/gcp/setup-secrets.sh
#
# DO NOT commit files containing real secret values.

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-asia-south1}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Set GCP_PROJECT_ID to your Google Cloud project ID."
  exit 1
fi

gcloud config set project "$PROJECT_ID"

enable_api() {
  gcloud services enable "$1" --project="$PROJECT_ID" >/dev/null
}

echo "Enabling required APIs..."
for api in secretmanager.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com firebasehosting.googleapis.com; do
  enable_api "$api"
done

upsert_secret() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "  skip $name (empty)"
    return 0
  fi
  if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID"
    echo "  updated $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy="automatic" --project="$PROJECT_ID"
    echo "  created $name"
  fi
}

prompt_or_env() {
  local var="$1"
  local current="${!var:-}"
  if [[ -n "$current" ]]; then
    echo "$current"
    return 0
  fi
  read -rsp "$var (input hidden, Enter to skip): " input
  echo ""
  echo "$input"
}

echo ""
echo "Paste secrets (from Render dashboard). Press Enter to skip optional secrets."
echo ""

upsert_secret "craftguru-database-url" "$(prompt_or_env DATABASE_URL)"
upsert_secret "craftguru-razorpay-key-id" "$(prompt_or_env RAZORPAY_KEY_ID)"
upsert_secret "craftguru-razorpay-key-secret" "$(prompt_or_env RAZORPAY_KEY_SECRET)"
upsert_secret "craftguru-whatsapp-access-token" "$(prompt_or_env WHATSAPP_ACCESS_TOKEN)"
upsert_secret "craftguru-whatsapp-phone-number-id" "$(prompt_or_env WHATSAPP_PHONE_NUMBER_ID)"
upsert_secret "craftguru-bill-api-secret" "$(prompt_or_env BILL_API_SECRET)"
upsert_secret "craftguru-guest-otp-pepper" "$(prompt_or_env GUEST_OTP_PEPPER)"
smtp_or_gmail_pass() {
  local v="${SMTP_PASS:-}"
  if [[ -z "$v" ]]; then v="${GMAIL_APP_PASSWORD:-}"; fi
  if [[ -n "$v" ]]; then
    echo "$v"
    return 0
  fi
  read -rsp "GMAIL_APP_PASSWORD or SMTP_PASS (hidden, Enter to skip): " input
  echo ""
  echo "$input"
}

upsert_secret "craftguru-google-client-id" "$(prompt_or_env GOOGLE_CLIENT_ID)"
upsert_secret "craftguru-smtp-pass" "$(smtp_or_gmail_pass)"
upsert_secret "craftguru-vendor-portal-password" "$(prompt_or_env VENDOR_PORTAL_PASSWORD)"
upsert_secret "craftguru-bigship-username" "$(prompt_or_env BIGSHIP_USERNAME)"
upsert_secret "craftguru-bigship-password" "$(prompt_or_env BIGSHIP_PASSWORD)"
upsert_secret "craftguru-bigship-access-key" "$(prompt_or_env BIGSHIP_ACCESS_KEY)"
upsert_secret "craftguru-delhivery-api-token" "$(prompt_or_env DELHIVERY_API_TOKEN)"

echo ""
echo "Granting Cloud Run service account access to secrets..."
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for secret in craftguru-database-url craftguru-razorpay-key-id craftguru-razorpay-key-secret \
  craftguru-whatsapp-access-token craftguru-whatsapp-phone-number-id craftguru-bill-api-secret \
  craftguru-guest-otp-pepper craftguru-google-client-id craftguru-smtp-pass craftguru-vendor-portal-password \
  craftguru-bigship-username craftguru-bigship-password craftguru-bigship-access-key craftguru-delhivery-api-token; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$secret" \
      --member="serviceAccount:${RUN_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$PROJECT_ID" \
      --quiet >/dev/null 2>&1 || true
  fi
done

echo ""
echo "Creating Artifact Registry repository (if missing)..."
if ! gcloud artifacts repositories describe craftguru --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create craftguru \
    --repository-format=docker \
    --location="$REGION" \
    --description="Craftguru API images" \
    --project="$PROJECT_ID"
fi

echo ""
echo "Done. Next: edit infra/gcp/env.cloudrun.yaml (ALLOWED_ORIGIN), then run infra/gcp/deploy-manual.sh"
