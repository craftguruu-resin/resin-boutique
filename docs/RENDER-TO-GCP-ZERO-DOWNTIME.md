# Render → Google Cloud Run (zero-downtime cutover)

**Stack (verified in this repo):** Static HTML/JS storefront + Node/Express API — **not** React/Vite.  
**Keep:** Neon PostgreSQL · Cloudinary URLs · existing Cloudflare DNS.  
**Move:** API (+ optional static CDN) to **Cloud Run** (`asia-south1`) + **Firebase Hosting**.

---

## Compatibility checklist

| Check | Status |
|-------|--------|
| `PORT` from env (default **8080**) | Done |
| Listen **0.0.0.0** | Done |
| `GET /health` → `{"status":"ok"}` | Done |
| `GET /api/health` (detailed, unbroken) | Done |
| Helmet + GZIP compression | Done |
| Request logging | Done |
| Graceful SIGTERM shutdown | Done |
| Neon SSL + pool + keepalive | Done |
| Multi-stage **Node 22** Dockerfile | Done |
| Cloud Build + GitHub Actions | Done |
| Cloudinary unchanged | Done |
| No DB migration required | Done |

---

## Architecture (target)

```
Cloudflare DNS (unchanged)
  www.yourdomain.com  → Firebase Hosting (CDN)
  api.yourdomain.com  → Cloud Run craftguru-api
                          ↓
                     Neon PostgreSQL (same DATABASE_URL)
Browsers → Cloudinary HTTPS URLs (unchanged)
```

**Same-origin alternative:** Point `www` at Cloud Run only (Express already serves static). Simpler DNS; less CDN for `media/`.

---

## Zero-downtime cutover (step-by-step)

### Phase 0 — Prep (no traffic change)

1. Create GCP project + enable billing ($300 trial OK).
2. Copy **all** Render env vars to a password manager (do not commit).
3. Confirm Neon is reachable with the **pooled** URL (`sslmode=require`).
4. Lower Cloudflare DNS TTL to 60–300s (24h before cutover).

### Phase 1 — GCP project & APIs

```bash
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_REGION=asia-south1
export SERVICE=craftguru-api
export AR_REPO=craftguru

gcloud auth login
gcloud config set project "$GCP_PROJECT_ID"

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

### Phase 2 — Artifact Registry

```bash
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="Craftguru Cloud Run images" \
  --project="$GCP_PROJECT_ID"
```

### Phase 3 — Secret Manager (from Render)

```bash
chmod +x infra/gcp/setup-secrets.sh infra/gcp/deploy-manual.sh

# Export from Render, then:
export DATABASE_URL='postgresql://...@...neon.tech/...?sslmode=require'
export RAZORPAY_KEY_ID='rzp_live_...'
export RAZORPAY_KEY_SECRET='...'
# optional:
export WHATSAPP_ACCESS_TOKEN='...'
export WHATSAPP_PHONE_NUMBER_ID='...'
export BILL_API_SECRET='...'
export GOOGLE_CLIENT_ID='...'
export SMTP_PASS='...'   # or Gmail app password
export VENDOR_PORTAL_PASSWORD='...'

./infra/gcp/setup-secrets.sh
```

### Phase 4 — IAM for Cloud Build → Cloud Run

```bash
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

### Phase 5 — Edit non-secret env

Edit `infra/gcp/env.cloudrun.yaml`:

- Set `ALLOWED_ORIGIN` to your **current** storefront origins (Pages + custom domain) **and** the future Firebase URL.
- Keep `VENDOR_REQUIRE_AUTH: "1"`.

### Phase 6 — First deploy (staging URL only)

```bash
cd /path/to/resin-boutique

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=${GCP_REGION},_SERVICE=${SERVICE},_AR_REPO=${AR_REPO},_MIN_INSTANCES=0" \
  .
```

Verify (**Render still serves production**):

```bash
RUN_URL=$(gcloud run services describe "$SERVICE" --region="$GCP_REGION" --format='value(status.url)')
curl -fsS "${RUN_URL}/health"
curl -fsS "${RUN_URL}/api/health"
# Expect database.reachable: true
```

Smoke-test checkout / vendor against `RUN_URL` in a private browser (set `data-bill-api-base` temporarily or use Host header tools).

### Phase 7 — Custom API domain (before DNS cutover)

```bash
gcloud run domain-mappings create \
  --service="$SERVICE" \
  --domain=api.YOUR_DOMAIN \
  --region="$GCP_REGION"
```

Add the printed DNS records in Cloudflare (**DNS only / grey cloud** until cert is Issued).

### Phase 8 — Frontend points at new API (no DNS change yet)

1. Set Cloudflare Pages / Firebase build env:
   - `PUBLIC_BILL_API_BASE=https://api.YOUR_DOMAIN` (or the `*.run.app` URL for a canary).
2. Deploy storefront with `node tools/set-bill-api-base.js`.
3. Or: keep Pages pointing at Render until Phase 9, then flip `PUBLIC_BILL_API_BASE` and redeploy Pages **and** Firebase.

**Zero-downtime pattern:**

1. Deploy Cloud Run (healthy).
2. Deploy storefront with **new** API base while DNS for `www` still on Pages.
3. Traffic uses new API; Render idle.
4. Switch `www` DNS to Firebase (optional CDN upgrade).
5. Suspend Render after 48–72h.

### Phase 9 — DNS cutover

| Host | Target |
|------|--------|
| `api` | Cloud Run domain mapping |
| `www` | Firebase Hosting (or keep Cloudflare Pages with new API base) |

Cloudflare SSL: **Full (strict)**.

Update Google OAuth authorized origins / redirect URIs to new domains.

### Phase 10 — Decommission Render

1. Suspend Render web service (do not delete for 1–2 weeks).
2. Remove Render blueprint usage.
3. Confirm Neon metrics still healthy.
4. Delete Render service when confident.

---

## Manual deploy (no Cloud Build trigger)

```bash
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_REGION=asia-south1
export PUBLIC_BILL_API_BASE=https://api.YOUR_DOMAIN
./infra/gcp/deploy-manual.sh
```

---

## Cloud Run revision / rollback

```bash
# List revisions
gcloud run revisions list --service="$SERVICE" --region="$GCP_REGION"

# Route 100% to previous revision (instant rollback)
gcloud run services update-traffic "$SERVICE" \
  --region="$GCP_REGION" \
  --to-revisions=REVISION_NAME=100

# Or split canary
gcloud run services update-traffic "$SERVICE" \
  --region="$GCP_REGION" \
  --to-revisions=NEW_REV=10,OLD_REV=90
```

DNS rollback: point Cloudflare records back to Render / Pages.

---

## Recommended Cloud Run settings

| Setting | Value | Why |
|---------|-------|-----|
| Region | `asia-south1` | India latency |
| CPU | 1 | Enough for Express + sharp |
| Memory | 1Gi | sharp / PDF bills |
| Concurrency | 80 | Default-ish; pair with `PG_POOL_MAX=5` |
| Min instances | 0 (cost) / 1 (no cold start) | Credits vs UX |
| Max instances | 20 | Burst |
| Timeout | 300s | Bill PDF / WhatsApp |
| Port | 8080 | Container |
| Probe | `GET /health` | Fast liveness |

---

## Frontend note (not React/Vite)

This repository is **static HTML/JS/CSS**. There is no Vite/React app to tree-shake.

Production storefront options:

1. **Firebase Hosting** (`firebase.json`) — CDN + cache headers (recommended).
2. **Cloud Run only** — Express `express.static` with cache headers (already wired).
3. **Cloudflare Pages** — keep current Pages; only change `PUBLIC_BILL_API_BASE` to Cloud Run.

---

## Security (applied)

- Helmet (CSP disabled for inline storefront scripts; CORP cross-origin for media).
- GZIP via `compression`.
- `x-powered-by` removed; weak ETag.
- Trust proxy for Cloud Run.
- Vendor auth defaults ON when `K_SERVICE` or `RENDER=true`.
- Secrets in Secret Manager, not image env.
- Prefer Cloudinary HTTPS over ephemeral Cloud Run disk.

---

## Deployment checklist

- [ ] GCP project + billing
- [ ] APIs enabled
- [ ] Artifact Registry `craftguru` in `asia-south1`
- [ ] Secrets created + Run SA can access
- [ ] `infra/gcp/env.cloudrun.yaml` ALLOWED_ORIGIN correct
- [ ] First Cloud Run deploy healthy (`/health`, `/api/health`)
- [ ] Neon `database.reachable: true`
- [ ] Razorpay test payment on Cloud Run URL
- [ ] Vendor login works
- [ ] Storefront `PUBLIC_BILL_API_BASE` updated
- [ ] Custom domain + SSL
- [ ] Google OAuth origins updated
- [ ] Cloudflare TTL cutover
- [ ] Render suspended (not deleted)
- [ ] Budget alerts $50 / $100 / $200

---

## Local verify before push

```bash
cd server
npm ci
PORT=8080 HOST=0.0.0.0 NODE_ENV=production node index.js
# other terminal:
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/api/health
```

```bash
# optional image build
docker build -t craftguru-api:local .
docker run --rm -p 8080:8080 -e PORT=8080 -e NODE_ENV=production craftguru-api:local
```
