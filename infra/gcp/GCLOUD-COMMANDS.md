# Copy-paste gcloud commands — Craftguru → Cloud Run (asia-south1)

Replace `YOUR_PROJECT_ID` and `YOUR_DOMAIN`. Full cutover: [RENDER-TO-GCP-ZERO-DOWNTIME.md](../../docs/RENDER-TO-GCP-ZERO-DOWNTIME.md).

```bash
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_REGION=asia-south1
export SERVICE=craftguru-api
export AR_REPO=craftguru

gcloud auth login
gcloud config set project "$GCP_PROJECT_ID"
```

## Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firebasehosting.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  iamcredentials.googleapis.com
```

## Artifact Registry

```bash
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="Craftguru" \
  --project="$GCP_PROJECT_ID"
```

## Secrets

```bash
./infra/gcp/setup-secrets.sh
```

## Cloud Build IAM

```bash
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')

for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/secretmanager.secretAccessor roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="$ROLE"
done
```

## Build & deploy

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=${GCP_REGION},_SERVICE=${SERVICE},_AR_REPO=${AR_REPO},_MIN_INSTANCES=0" \
  .
```

## Verify

```bash
RUN_URL=$(gcloud run services describe "$SERVICE" --region="$GCP_REGION" --format='value(status.url)')
curl -fsS "${RUN_URL}/health"
curl -fsS "${RUN_URL}/api/health"
```

## Domain mapping

```bash
gcloud run domain-mappings create \
  --service="$SERVICE" \
  --domain=api.YOUR_DOMAIN \
  --region="$GCP_REGION"
```

## Update env / secrets later

```bash
gcloud run services update "$SERVICE" \
  --region="$GCP_REGION" \
  --env-vars-file=infra/gcp/env.cloudrun.yaml
```

```bash
gcloud run services update "$SERVICE" \
  --region="$GCP_REGION" \
  --update-secrets=DATABASE_URL=craftguru-database-url:latest
```

## Revisions & rollback

```bash
gcloud run revisions list --service="$SERVICE" --region="$GCP_REGION"

gcloud run services update-traffic "$SERVICE" \
  --region="$GCP_REGION" \
  --to-revisions=PREVIOUS_REVISION=100
```

## Logs & monitoring

```bash
gcloud run services logs read "$SERVICE" --region="$GCP_REGION" --limit=50

gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE}" --limit=20
```

## Optional: min instances = 1 (no cold start)

```bash
gcloud run services update "$SERVICE" \
  --region="$GCP_REGION" \
  --min-instances=1
```
