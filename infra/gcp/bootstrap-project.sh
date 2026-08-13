#!/usr/bin/env bash
# Non-interactive GCP bootstrap: APIs, Artifact Registry, IAM for Cloud Build + Cloud Run.
# Does NOT create secrets — run setup-secrets.sh after copying values from Render.
#
# Usage:
#   export GCP_PROJECT_ID=craft-guru-production
#   ./infra/gcp/bootstrap-project.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-craft-guru-production}"
REGION="${GCP_REGION:-asia-south1}"
AR_REPO="${GCP_AR_REPO:-craftguru}"

gcloud config set project "$PROJECT_ID"

enable_api() {
  gcloud services enable "$1" --project="$PROJECT_ID" >/dev/null
  echo "  enabled $1"
}

echo "Enabling APIs..."
for api in \
  secretmanager.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firebasehosting.googleapis.com \
  firebase.googleapis.com; do
  enable_api "$api"
done

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo ""
echo "Granting Cloud Build service account deploy permissions..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin" \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/artifactregistry.writer" \
  --quiet >/dev/null

# Cloud Build default worker (compute SA) needs the same roles when builds run without custom SA.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/run.admin" \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/storage.admin" \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/artifactregistry.writer" \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/logging.logWriter" \
  --quiet >/dev/null

echo ""
echo "Creating Artifact Registry repository (if missing)..."
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Craftguru API images" \
    --project="$PROJECT_ID"
  echo "  created $AR_REPO"
else
  echo "  exists $AR_REPO"
fi

echo ""
echo "Bootstrap complete for project $PROJECT_ID ($REGION)."
echo "Next:"
echo "  1. Copy Render env vars → export DATABASE_URL, GMAIL_APP_PASSWORD, etc."
echo "  2. ./infra/gcp/setup-secrets.sh"
echo "  3. Set GMAIL_USER + MAIL_FROM in Cloud Run (see infra/gcp/RENDER-ENV-TO-GCP.md)"
echo "  4. ./infra/gcp/deploy-manual.sh"
