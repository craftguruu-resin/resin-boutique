# Exact gcloud commands — Craftguru GCP migration

Replace placeholders before running. **Do not run until migration is approved.**

| Placeholder | Example |
|-------------|---------|
| `PROJECT_ID` | `craftguru-prod-123` |
| `REGION` | `asia-south1` (Mumbai — low latency for India) |
| `DOMAIN` | `craftguruindia.com` |

---

## 1. Install and authenticate

```bash
# Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud auth application-default login

export GCP_PROJECT_ID=PROJECT_ID
export GCP_REGION=asia-south1

gcloud config set project "$GCP_PROJECT_ID"
```

---

## 2. Enable billing and APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firebasehosting.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  --project="$GCP_PROJECT_ID"
```

---

## 3. Create secrets (interactive script)

```bash
chmod +x infra/gcp/setup-secrets.sh infra/gcp/deploy-manual.sh

# Optional: export secrets from Render before running
export DATABASE_URL='postgresql://USER:PASS@HOST/DB?sslmode=require'
export RAZORPAY_KEY_ID='rzp_live_...'
export RAZORPAY_KEY_SECRET='...'
# ... etc

./infra/gcp/setup-secrets.sh
```

---

## 4. Create Artifact Registry (if script skipped)

```bash
gcloud artifacts repositories create craftguru \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="Craftguru API" \
  --project="$GCP_PROJECT_ID"
```

---

## 5. Grant Cloud Build permission to deploy Cloud Run

```bash
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

---

## 6. Deploy API (Cloud Build → Cloud Run)

```bash
cd /path/to/resin-boutique

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=${GCP_REGION},_SERVICE=craftguru-api,_AR_REPO=craftguru,_MIN_INSTANCES=0" \
  .
```

Verify:

```bash
RUN_URL=$(gcloud run services describe craftguru-api \
  --region="$GCP_REGION" \
  --format='value(status.url)')

curl -sS "${RUN_URL}/api/health" | jq .
```

---

## 7. Map custom API domain (SSL managed by Google)

```bash
gcloud run domain-mappings create \
  --service=craftguru-api \
  --domain=api.craftguruindia.com \
  --region="$GCP_REGION" \
  --project="$GCP_PROJECT_ID"
```

Cloud Run prints DNS records — add them in **Cloudflare** (CNAME). Use **DNS only** (grey cloud) initially if cert provisioning fails with proxy on.

---

## 8. Firebase Hosting (storefront)

```bash
npm install -g firebase-tools
firebase login

# Edit .firebaserc → set YOUR_FIREBASE_PROJECT_ID
firebase use "$GCP_PROJECT_ID"
firebase init hosting   # or use committed firebase.json

export PUBLIC_BILL_API_BASE="https://api.craftguruindia.com"
node tools/set-bill-api-base.js

firebase deploy --only hosting --project "$GCP_PROJECT_ID"
```

Add custom domain in Firebase Console → Hosting → Add custom domain → `www.craftguruindia.com` → follow DNS records in Cloudflare.

---

## 9. Update Cloud Run env (after domain known)

Edit `infra/gcp/env.cloudrun.yaml`:

```yaml
ALLOWED_ORIGIN: "https://www.craftguruindia.com,https://craftguruindia.com"
```

Redeploy:

```bash
gcloud builds submit --config=cloudbuild.yaml --substitutions="_REGION=${GCP_REGION}" .
```

---

## 10. GitHub Actions — Workload Identity Federation (recommended)

```bash
# Create pool + provider (once per project)
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Create deploy service account
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions deployer"

# Bind roles
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member="serviceAccount:github-deployer@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$ROLE"
done

# Allow your GitHub repo to impersonate SA (replace ORG/REPO)
gcloud iam service-accounts add-iam-policy-binding \
  "github-deployer@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/ORG/resin-boutique"
```

Add GitHub secrets: `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `PUBLIC_BILL_API_BASE`.

---

## 11. Monitoring — uptime check (optional)

```bash
gcloud monitoring uptime create craftguru-api-health \
  --resource-type=uptime-url \
  --display-name="Craftguru API health" \
  --http-check-path="/api/health" \
  --hostname="api.craftguruindia.com" \
  --period=300
```

---

## 12. Budget alert

```bash
# Create in Console: Billing → Budgets → $50 / $100 alerts
# Or use Cloud Billing Budget API
```

---

## 13. Database migrate (only if Neon is fresh)

```bash
# Local with prod DATABASE_URL — be careful
cd server
export DATABASE_URL='...neon...'
npm install
npm run db:migrate
```

Skip if Render production already ran migrations against the same Neon database.

---

## 14. Rollback

```bash
# List revisions
gcloud run revisions list --service=craftguru-api --region="$GCP_REGION"

# Route 100% traffic to previous revision
gcloud run services update-traffic craftguru-api \
  --region="$GCP_REGION" \
  --to-revisions=craftguru-api-00012-abc=100
```

Repoint Cloudflare DNS back to Render / Pages if needed.
