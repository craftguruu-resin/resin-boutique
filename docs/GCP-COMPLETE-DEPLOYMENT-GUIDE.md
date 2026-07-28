---
title: "Craftguru — Complete Google Cloud Platform Deployment Guide"
subtitle: "Beginner-friendly Render → Cloud Run migration (Neon + Cloudinary unchanged)"
author: "Craftguru Engineering"
version: "1.0"
date: "2026-07-28"
region: "asia-south1 (Mumbai)"
service: "craftguru-api"
status: "Production-ready documentation"
---

<!--
PDF EXPORT NOTES (headers, footers, page numbers)
-------------------------------------------------
Markdown itself does not render page numbers. Use one of:

1) Pandoc → PDF (recommended):
   pandoc docs/GCP-COMPLETE-DEPLOYMENT-GUIDE.md \
     -o docs/GCP-COMPLETE-DEPLOYMENT-GUIDE.pdf \
     --toc --toc-depth=3 \
     -V geometry:margin=1in \
     -V fontsize=11pt \
     --pdf-engine=xelatex \
     -V mainfont="Inter" \
     -V monofont="Menlo" \
     --include-in-header=docs/pdf-header.tex

2) Or open this file in a Markdown→PDF tool (Typora, VS Code "Markdown PDF",
   Google Docs paste, or Notion export) and enable:
   - Header: "Craftguru · GCP Deployment Guide"
   - Footer: "Confidential · Page [n]"
   - Table of contents
-->

<div style="page-break-after: always;"></div>

# Craftguru — Complete Google Cloud Platform Deployment Guide

**Document type:** End-to-end operations manual  
**Audience:** First-time GCP deployers  
**Application:** Resin boutique storefront + Express API (`resin-boutique`)  
**Target platform:** Google Cloud Run  
**Region:** `asia-south1` (Mumbai, India)  
**Database:** Neon PostgreSQL (**do not migrate**)  
**Images:** Cloudinary (**do not migrate**)  
**Previous host:** Render (+ optional Cloudflare Pages)

> **How to use this document**  
> Work top to bottom. Do not skip verification boxes.  
> Replace placeholders such as `YOUR_PROJECT_ID` and `YOUR_DOMAIN` with your real values.  
> Keep Render running until Phase 8 cutover is complete.

---

## Document control

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Last updated | 2026-07-28 |
| Cloud Run service name | `craftguru-api` |
| Artifact Registry repo | `craftguru` |
| Container port | `8080` |
| Health endpoints | `GET /health`, `GET /api/health` |
| Repo paths | `Dockerfile`, `cloudbuild.yaml`, `infra/gcp/*`, `.github/workflows/gcp-deploy.yml` |

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local verification](#3-local-verification)
4. [Create a GCP project](#4-create-a-gcp-project)
5. [Enable APIs](#5-enable-apis)
6. [Configure authentication](#6-configure-authentication)
7. [Create Artifact Registry](#7-create-artifact-registry)
8. [Docker build](#8-docker-build)
9. [Push Docker image](#9-push-docker-image)
10. [Deploy to Cloud Run](#10-deploy-to-cloud-run)
11. [Configure environment variables](#11-configure-environment-variables)
12. [Configure secrets](#12-configure-secrets)
13. [Configure storage](#13-configure-storage)
14. [Configure domain](#14-configure-domain)
15. [Configure SSL](#15-configure-ssl)
16. [Configure Cloudflare](#16-configure-cloudflare)
17. [Logging](#17-logging)
18. [Monitoring](#18-monitoring)
19. [Updating the application](#19-updating-the-application)
20. [Rollback](#20-rollback)
21. [CI/CD from GitHub](#21-cicd-from-github)
22. [Cost optimisation](#22-cost-optimisation)
23. [Troubleshooting](#23-troubleshooting)
24. [Final checklist](#24-final-checklist)
25. [Appendix A — Copy-paste command sheet](#appendix-a--copy-paste-command-sheet)
26. [Appendix B — Glossary](#appendix-b--glossary)
27. [Appendix C — PDF export](#appendix-c--pdf-export)

---

# 1. Project overview

## 1.1 What this application is

Craftguru is an e-commerce style storefront for resin products and related shops (raw materials, photo frames, return gifts), plus a vendor admin area.

| Layer | Technology in *this* repository | Simple explanation |
|-------|----------------------------------|--------------------|
| Frontend | Static HTML, CSS, JavaScript | Web pages customers open in a browser |
| Backend | Node.js + Express (`server/`) | API that talks to the database, payments, WhatsApp bills, vendor auth |
| Database | **Neon PostgreSQL** (external) | Stores orders, guests, products metadata, vendor data |
| Images | **Cloudinary** HTTPS URLs (+ bundled `media/` files) | Product photos delivered from Cloudinary CDN |
| Hosting target | **Google Cloud Run** | Runs the Docker container; scales up/down automatically |

> **Important correction vs generic “React + Vite” templates**  
> This repository is **not** a React/Vite SPA. It is static HTML/JS served alongside Express. You still deploy one Docker image to Cloud Run. Optional CDN for static files: Firebase Hosting or Cloudflare Pages.

## 1.2 Architecture diagram

```mermaid
flowchart TB
  subgraph Users
    C[Customer browser]
    V[Vendor browser]
  end

  subgraph DNS["Cloudflare DNS"]
    WWW["www.YOUR_DOMAIN"]
    API["api.YOUR_DOMAIN"]
  end

  subgraph GCP["Google Cloud · asia-south1"]
    CR["Cloud Run<br/>craftguru-api<br/>Express + static"]
    AR["Artifact Registry<br/>Docker images"]
    SM["Secret Manager<br/>DATABASE_URL, Razorpay, …"]
    CL["Cloud Logging"]
    CM["Cloud Monitoring"]
    CB["Cloud Build / GitHub Actions"]
  end

  subgraph External["Keep external — do not migrate"]
    NEON[(Neon PostgreSQL)]
    CLDY[Cloudinary CDN]
    RZP[Razorpay]
    WA[Meta WhatsApp API]
    SMTP[Email SMTP / Gmail]
  end

  C --> WWW
  V --> WWW
  WWW -->|HTML/JS/CSS optional CDN| C
  C -->|API calls| API
  V -->|API calls| API
  API --> CR
  CR --> SM
  CR --> NEON
  C --> CLDY
  CR --> RZP
  CR --> WA
  CR --> SMTP
  CB --> AR
  AR --> CR
  CR --> CL
  CR --> CM
```

## 1.3 Deployment flow

```mermaid
flowchart LR
  A[Developer laptop] --> B[gcloud / Docker]
  B --> C[Artifact Registry]
  C --> D[Cloud Run revision]
  D --> E[Custom domain + SSL]
  E --> F[Cloudflare DNS cutover]
  F --> G[Suspend Render]
```

## 1.4 Secrets vs config vs storage

| Kind | Examples | Where it lives |
|------|----------|----------------|
| Secrets | Neon `DATABASE_URL`, Razorpay keys, WhatsApp token, SMTP password | **Secret Manager** → mounted into Cloud Run |
| Config | `ALLOWED_ORIGIN`, `NODE_ENV`, `PG_POOL_MAX` | Cloud Run environment variables / `infra/gcp/env.cloudrun.yaml` |
| Product images | `https://res.cloudinary.com/...` | Cloudinary + Postgres path/URL fields |
| Bundled media | `media/` in the Docker image | Shipped inside the container (for static catalog assets) |

## 1.5 Domains (recommended)

| Hostname | Points to | Purpose |
|----------|-----------|---------|
| `api.YOUR_DOMAIN` | Cloud Run | Backend API + same-origin fallback static |
| `www.YOUR_DOMAIN` | Cloudflare Pages **or** Firebase Hosting **or** Cloud Run | Customer storefront |
| Apex `YOUR_DOMAIN` | Redirect to `www` | Brand URL |

## 1.6 What we are **not** deploying

| Service | Used by this app? | Why |
|---------|-------------------|-----|
| Cloud SQL | **No** | Database stays on **Neon** |
| Cloud Storage (primary) | **No** | Images stay on **Cloudinary** |
| GCE VMs | **No** | Prefer serverless Cloud Run |
| Kubernetes | **No** | Unnecessary cost/complexity |

> **Best practice**  
> Only enable and pay for services you need. Neon + Cloudinary already solve database and media.

**Screenshot**

> **Insert Screenshot Here**  
> Description: A whiteboard-style diagram or the Mermaid architecture from this section rendered in the Console “Overview” notes. Optional: your own draw.io export labelled “Craftguru production architecture”.

---

# 2. Prerequisites

## 2.1 Google Cloud account

**Why required:** Every GCP resource belongs to an account and a project.

1. Open [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Sign in with a Google account you control.
3. Accept terms if prompted.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Google Cloud Console home with the blue **Activate** / project picker at the top.

**Verify:** You can see the Console home without an access-denied error.

## 2.2 Billing and Free Trial

**Why required:** Cloud Run, Artifact Registry, and Cloud Build are billable. Free Trial credits (~USD 300) fund early usage.

1. Click **Activate** / **Start free** if shown.
2. Open the navigation menu ☰ → **Billing**.
3. Confirm a billing account exists and is linked to your project (after project creation).
4. ☰ → **Billing** → **Budgets & alerts** → **CREATE BUDGET**.
5. Set amount e.g. `$50`, alerts at 50% / 90% / 100%.

**Common mistake:** Creating resources in a project with **no billing** → API enablement fails.

**Verify:** Billing overview shows an active account and (if applicable) Free Trial credits.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Billing → Overview showing linked billing account and Free Trial status.

## 2.3 Install Google Cloud CLI (`gcloud`)

**Why required:** Terminal commands create registries, secrets, builds, and Cloud Run services.

### macOS (Homebrew)

```bash
brew install --cask google-cloud-sdk
```

### Verify

```bash
gcloud --version
```

**Expected output:** Lines containing `Google Cloud SDK` and component versions.

**Common mistake:** Opening a new terminal without restarting shell init → `command not found: gcloud`. Fix: reopen Terminal or `source` your shell profile.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Terminal window showing successful `gcloud --version` output.

## 2.4 Install Docker

**Why required:** Local image build/push (Path B). Path A (Cloud Build) can build without local Docker, but Docker is recommended for testing.

1. Install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/).
2. Open Docker Desktop and wait until status is **Running**.

```bash
docker --version
docker info
```

**Expected output:** Version string; `docker info` prints server info without “Cannot connect to the Docker daemon”.

## 2.5 Install Git

```bash
git --version
```

**Why required:** Clone/pull the repository and tag images with commit SHAs.

## 2.6 Install Node.js (for local API + HTML patching)

```bash
node --version
npm --version
```

**Recommended:** Node **20+** or **22** (Dockerfile uses Node 22).

**Why required:** Run the Express server locally and `node tools/set-bill-api-base.js` when patching production API URLs into HTML.

## 2.7 Python

**Why required for this project:** Not required to *run* the app. Python is only used **inside the Docker build** as a build dependency for native modules (`sharp`). You do **not** need to install Python on your Mac for deployment.

## 2.8 Gather secrets from Render (before GCP)

**Why required:** You will paste the same production secrets into Secret Manager.

1. Open [https://dashboard.render.com](https://dashboard.render.com)
2. Click your **Web Service**
3. Left sidebar → **Environment**
4. Copy values into a private password manager (never into Git)

Minimum production set:

| Env var | Purpose |
|---------|---------|
| `DATABASE_URL` | Neon pooled connection string |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Payments |
| `ALLOWED_ORIGIN` | CORS allowlist |
| `WHATSAPP_*` | Order bills (if used) |
| `VENDOR_PORTAL_*` | Vendor login |
| SMTP / Gmail vars | OTP email |
| `GOOGLE_CLIENT_ID` | Google Sign-In |
| `BILL_API_SECRET` | Optional shared secret |

**Screenshot**

> **Insert Screenshot Here**  
> Description: Render Dashboard → Environment list (blur secret values before sharing screenshots).

---

# 3. Local verification

Complete this **before** touching GCP so you know the app works on your machine.

## 3.1 Open the repository

```bash
cd /Users/deveshjangid/Desktop/resin-boutique
```

**Verify:**

```bash
ls Dockerfile cloudbuild.yaml server/package.json
```

**Expected output:** Those three paths listed.

## 3.2 Install backend dependencies

```bash
cd server
npm ci
```

**What it does:** Installs exact versions from `package-lock.json` (including `express`, `pg`, `compression`, `helmet`, `sharp`).

**Expected output:** `added N packages` without fatal errors.

**Common mistake:** Running `npm install` in the repo root only — dependencies live in `server/`.

## 3.3 Configure local environment

```bash
cp .env.example .env
```

Edit `server/.env`:

- Set `DATABASE_URL` to your Neon URL (or local Docker Postgres).
- Set `PORT=8080` and `HOST=0.0.0.0` (or keep a local port you prefer).
- Leave secrets empty if you only want health checks.

> **Warning**  
> Never commit `server/.env`. It is gitignored.

## 3.4 Run the backend

```bash
cd /Users/deveshjangid/Desktop/resin-boutique/server
PORT=8080 HOST=0.0.0.0 node index.js
```

**Expected output (example):**

```text
Craftguru server listening on http://0.0.0.0:8080
Health: GET /health  ·  Detailed: GET /api/health
```

## 3.5 Verify health endpoints

In a **second** terminal:

```bash
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/api/health
```

**Expected `/health`:**

```json
{"status":"ok"}
```

**Expected `/api/health`:** JSON including `"ok": true` and, if Neon is configured, `"database":{"enabled":true,"reachable":true,...}`.

## 3.6 Run / open the frontend

Because the frontend is static HTML:

1. With the server running, open:  
   `http://127.0.0.1:8080/index.html`
2. Or open HTML files via Live Server **and** set `data-bill-api-base` to `http://127.0.0.1:8080`.

**Verify:** Homepage loads; browser Network tab shows API calls succeeding (or CORS errors if origin not allowed — set `ALLOWED_ORIGIN=*` for local).

**Screenshot**

> **Insert Screenshot Here**  
> Description: Browser showing Craftguru homepage at `127.0.0.1:8080` beside a terminal with health curl output.

---

# 4. Create a GCP project

## 4.1 Why

Projects isolate billing, IAM, and resources. Never dump production into a personal “playground” project without billing alerts.

## 4.2 Console steps

1. Open [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Click the **project picker** (top bar, next to “Google Cloud”).
3. Click **NEW PROJECT**.
4. **Project name:** e.g. `Craftguru Prod`
5. Note the generated **Project ID** (e.g. `craftguru-prod-482913`) — you will use this in every command.
6. Click **CREATE**.
7. Wait until creation finishes, then select the project in the picker.

**Screenshot**

> **Insert Screenshot Here**  
> Description: “New Project” dialog with Project name and Project ID fields; CREATE button.

## 4.3 Link billing

1. ☰ → **Billing**
2. If prompted, **Link a billing account** to this project.

**Verify:**

```bash
gcloud projects describe YOUR_PROJECT_ID --format='value(projectId)'
```

**Expected output:** Your project ID echoed back.

Set defaults:

```bash
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_REGION=asia-south1
export SERVICE=craftguru-api
export AR_REPO=craftguru

gcloud config set project "$GCP_PROJECT_ID"
gcloud config set run/region "$GCP_REGION"
gcloud config list
```

**Expected output:** `core/project` and `run/region` show your values.

**Common mistake:** Running commands while a different project is selected in `gcloud config` → resources appear “missing”.

---

# 5. Enable APIs

## 5.1 What an “API” means here

In Google Cloud, enabling an API turns on a product (Cloud Run, Secret Manager, etc.) for your project. Until enabled, deploy commands fail.

## 5.2 Services for this project

| API | Required? | Purpose |
|-----|-----------|---------|
| Cloud Run | **Yes** | Runs the container |
| Artifact Registry | **Yes** | Stores Docker images |
| Cloud Build | **Yes** (recommended) | Builds & deploys from source |
| Secret Manager | **Yes** | Stores Neon/Razorpay secrets |
| Cloud Logging | **Yes** (auto with Run) | Application logs |
| Cloud Monitoring | Recommended | Metrics & alerts |
| Firebase Hosting | Optional | CDN for static storefront |
| Cloud Storage | **No** for this app | See §13 |
| Cloud SQL | **No** | Neon stays external |

## 5.3 Enable via Console

1. ☰ → **APIs & Services** → **Library**
2. Search **Cloud Run API** → open → **ENABLE**
3. Repeat for: **Artifact Registry API**, **Cloud Build API**, **Secret Manager API**, **Cloud Logging API**, **Cloud Monitoring API**

**Screenshot**

> **Insert Screenshot Here**  
> Description: APIs & Services → Library search results for “Cloud Run”, ENABLE button visible.

## 5.4 Enable via CLI (faster)

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  iamcredentials.googleapis.com \
  --project="$GCP_PROJECT_ID"
```

Optional:

```bash
gcloud services enable firebasehosting.googleapis.com --project="$GCP_PROJECT_ID"
```

**What it does:** Enables each product API on the project.

**Expected output:** `Operation finished successfully` style messages (or quiet success).

**Verify:**

```bash
gcloud services list --enabled --project="$GCP_PROJECT_ID" | grep -E 'run|artifact|cloudbuild|secretmanager'
```

**Common mistake:** Enabling APIs in the wrong project.

---

# 6. Configure authentication

## 6.1 User login (you)

```bash
gcloud auth login
```

**What it does:** Opens a browser; binds your user identity to the CLI.

```bash
gcloud auth application-default login
```

**What it does:** Stores Application Default Credentials for local tools/SDKs.

**Verify:**

```bash
gcloud auth list
```

**Expected output:** Your account with `ACTIVE` asterisk.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Browser OAuth consent screen for Google Cloud SDK, and terminal `gcloud auth list`.

## 6.2 Service accounts (simple explanation)

| Account | Role in this setup |
|---------|-------------------|
| Your user | Creates resources interactively |
| Cloud Build SA (`…@cloudbuild.gserviceaccount.com`) | Builds images & deploys Cloud Run |
| Compute default SA (`…-compute@developer.gserviceaccount.com`) | Often runs Cloud Run revisions; needs Secret Accessor |

## 6.3 Grant Cloud Build deploy permissions

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

**What it does:** Lets Cloud Build push images and update Cloud Run with secrets.

**Verify (Console):** ☰ → **IAM & Admin** → **IAM** → find Cloud Build service account → roles listed.

**Screenshot**

> **Insert Screenshot Here**  
> Description: IAM page showing Cloud Build service account with Run Admin / Secret Accessor roles.

---

# 7. Create Artifact Registry

## 7.1 What it is

**Artifact Registry** is Google’s private Docker Hub for your project. Cloud Run pulls images from here.

## 7.2 Console steps

1. ☰ → **Artifact Registry** → **Repositories**
2. Click **CREATE REPOSITORY**
3. **Name:** `craftguru`
4. **Format:** Docker
5. **Mode:** Standard
6. **Location type:** Region
7. **Region:** `asia-south1 (Mumbai)`
8. Click **CREATE**

**Screenshot**

> **Insert Screenshot Here**  
> Description: Artifact Registry → Create repository form with Docker + asia-south1 selected.

## 7.3 CLI

```bash
gcloud artifacts repositories create craftguru \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Craftguru Cloud Run images" \
  --project="$GCP_PROJECT_ID"
```

**Expected output:** `Created repository [craftguru].`  
If it already exists: an already-exists error — **OK**.

**Verify:**

```bash
gcloud artifacts repositories list --location=asia-south1 --project="$GCP_PROJECT_ID"
```

## 7.4 Authenticate Docker to Artifact Registry

```bash
gcloud auth configure-docker asia-south1-docker.pkg.dev
```

**What it does:** Adds a credential helper so `docker push` works against GCP.

**Expected output:** `Adding credentials for: asia-south1-docker.pkg.dev`

---

# 8. Docker build

## 8.1 What the project Dockerfile does

Multi-stage build:

1. **deps** — Node 22 installs `server` production npm packages  
2. **runner** — slim image + app source + listens on port 8080  

## 8.2 Build locally (Path B)

```bash
cd /Users/deveshjangid/Desktop/resin-boutique

export IMAGE="asia-south1-docker.pkg.dev/${GCP_PROJECT_ID}/craftguru/craftguru-api"
export TAG="$(git rev-parse --short HEAD)"

docker build -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" .
```

| Part | Meaning |
|------|---------|
| `docker build` | Build image from `Dockerfile` |
| `-t name:tag` | Name the image |
| `.` | Build context = current directory (honours `.dockerignore`) |

**Expected output:** Many step logs ending with `Successfully tagged …`

**Common mistakes:**
- Docker Desktop not running
- Building from `server/` instead of repo root (must be repo root — Dockerfile expects monorepo layout)
- Huge context because `.dockerignore` missing (slow uploads)

**Verify:**

```bash
docker images | head
```

You should see `craftguru-api` tags.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Terminal finishing `docker build` successfully; Docker Desktop Images list showing the new image.

## 8.3 Optional local run test

```bash
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e HOST=0.0.0.0 \
  -e NODE_ENV=production \
  "${IMAGE}:${TAG}"
```

Then:

```bash
curl -fsS http://127.0.0.1:8080/health
```

> **Note**  
> Without mounting secrets, `/api/health` may show database not reachable — that is expected for a smoke test.

---

# 9. Push Docker image

```bash
docker push "${IMAGE}:${TAG}"
docker push "${IMAGE}:latest"
```

**What it does:** Uploads layers to Artifact Registry.

**Expected output:** Layer digests and `latest: digest: sha256:…`

**Verify (Console):** ☰ → **Artifact Registry** → **Repositories** → `craftguru` → image `craftguru-api` → tags.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Artifact Registry repository showing `craftguru-api` with `latest` and commit SHA tags.

**Verify (CLI):**

```bash
gcloud artifacts docker images list \
  "asia-south1-docker.pkg.dev/${GCP_PROJECT_ID}/craftguru/craftguru-api" \
  --include-tags
```

---

# 10. Deploy to Cloud Run

## 10.1 What Cloud Run is

Cloud Run runs your container on HTTPS URLs. It can scale to **zero** when idle (cheap) or keep min instances warm.

## 10.2 Path A — one command via Cloud Build (recommended)

```bash
cd /Users/deveshjangid/Desktop/resin-boutique

# Create secrets FIRST (see §12) — at least database + razorpay

gcloud builds submit \
  --project="$GCP_PROJECT_ID" \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=asia-south1,_SERVICE=craftguru-api,_AR_REPO=craftguru,_MIN_INSTANCES=0" \
  .
```

**What it does:** Upload source → build image → push → `gcloud run deploy`.

**Expected output:** Build steps `SUCCESS`; final Service URL printed.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Cloud Build → History → build detail with green checkmarks for build, push, deploy steps.

## 10.3 Path B — deploy an already-pushed image

```bash
gcloud run deploy craftguru-api \
  --project="$GCP_PROJECT_ID" \
  --region=asia-south1 \
  --platform=managed \
  --image="${IMAGE}:${TAG}" \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=1Gi \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=300 \
  --cpu-boost \
  --execution-environment=gen2 \
  --env-vars-file=infra/gcp/env.cloudrun.yaml \
  --set-secrets=DATABASE_URL=craftguru-database-url:latest,RAZORPAY_KEY_ID=craftguru-razorpay-key-id:latest,RAZORPAY_KEY_SECRET=craftguru-razorpay-key-secret:latest
```

### Deployment options explained

| Flag | Meaning |
|------|---------|
| `--allow-unauthenticated` | Public internet can call your API (storefront needs this) |
| `--port=8080` | Must match container listen port |
| `--cpu=1` / `--memory=1Gi` | Instance size |
| `--min-instances=0` | Scale to zero when idle |
| `--max-instances=10` | Cost/safety cap |
| `--concurrency=80` | Parallel requests per instance |
| `--timeout=300` | Max request duration (PDF/WhatsApp) |
| `--cpu-boost` | Faster cold starts |
| `--env-vars-file` | Non-secret config |
| `--set-secrets` | Mount Secret Manager values as env vars |

## 10.4 Console deploy (UI)

1. ☰ → **Cloud Run** → **CREATE SERVICE** (or select existing → **EDIT & DEPLOY NEW REVISION**)
2. **Container image URL** → select from Artifact Registry
3. **Region:** `asia-south1`
4. **Authentication:** Allow public access
5. **Container** tab → Container port `8080`
6. **Variables & Secrets** → add env + secrets
7. **CREATE** / **DEPLOY**

**Screenshot**

> **Insert Screenshot Here**  
> Description: Cloud Run service page for `craftguru-api` showing URL, region asia-south1, and “Healthy” revisions.

## 10.5 Get the service URL

```bash
export RUN_URL=$(gcloud run services describe craftguru-api \
  --region=asia-south1 \
  --project="$GCP_PROJECT_ID" \
  --format='value(status.url)')
echo "$RUN_URL"
```

**Verify:**

```bash
curl -fsS "${RUN_URL}/health"
curl -fsS "${RUN_URL}/api/health"
```

---

# 11. Configure environment variables

## 11.1 Non-secret variables (from repo template)

Edit `infra/gcp/env.cloudrun.yaml` before deploy:

```yaml
NODE_ENV: "production"
HOST: "0.0.0.0"
PORT: "8080"
ALLOWED_ORIGIN: "https://www.YOUR_DOMAIN,https://YOUR_DOMAIN"
VENDOR_REQUIRE_AUTH: "1"
VENDOR_PORTAL_USER: "nammu"
META_GRAPH_VERSION: "v21.0"
PG_POOL_MAX: "5"
PG_SSL: "true"
```

**Why `ALLOWED_ORIGIN` matters:** Browsers block API calls from your shop domain unless CORS allows them.

## 11.2 Console method

1. Cloud Run → `craftguru-api` → **EDIT & DEPLOY NEW REVISION**
2. **Variables & Secrets**
3. Under **Variables**, click **ADD VARIABLE**
4. Enter name/value pairs
5. Deploy

## 11.3 CLI method

```bash
gcloud run services update craftguru-api \
  --region=asia-south1 \
  --project="$GCP_PROJECT_ID" \
  --env-vars-file=infra/gcp/env.cloudrun.yaml
```

Or patch one value:

```bash
gcloud run services update craftguru-api \
  --region=asia-south1 \
  --update-env-vars="ALLOWED_ORIGIN=https://www.YOUR_DOMAIN,https://YOUR_DOMAIN"
```

**Verify:** Cloud Run → Revisions → Variables & Secrets lists your keys (values visible for non-secrets).

**Screenshot**

> **Insert Screenshot Here**  
> Description: Cloud Run Variables & Secrets panel showing NODE_ENV, ALLOWED_ORIGIN, etc.

---

# 12. Configure secrets

## 12.1 Why Secret Manager

Secrets must not live in Git or in plaintext Docker image layers. Secret Manager stores them encrypted and mounts them into Cloud Run at runtime.

## 12.2 Create secrets (script)

```bash
cd /Users/deveshjangid/Desktop/resin-boutique
chmod +x infra/gcp/setup-secrets.sh

export GCP_PROJECT_ID=YOUR_PROJECT_ID
export DATABASE_URL='postgresql://USER:PASS@HOST/neondb?sslmode=require'
export RAZORPAY_KEY_ID='rzp_live_...'
export RAZORPAY_KEY_SECRET='...'
# optional exports: WHATSAPP_*, BILL_API_SECRET, GOOGLE_CLIENT_ID, SMTP_PASS, VENDOR_PORTAL_PASSWORD

./infra/gcp/setup-secrets.sh
```

**What it does:** Creates/updates secrets and grants the Cloud Run runtime SA `secretAccessor`.

## 12.3 Console method

1. ☰ → **Security** → **Secret Manager** (or search “Secret Manager”)
2. **CREATE SECRET**
3. Name: `craftguru-database-url`
4. Secret value: paste Neon URL
5. **CREATE**
6. Repeat for Razorpay and others

**Screenshot**

> **Insert Screenshot Here**  
> Description: Secret Manager list showing `craftguru-database-url`, `craftguru-razorpay-key-id`, etc. (values hidden).

## 12.4 Mount secrets on Cloud Run

```bash
gcloud run services update craftguru-api \
  --region=asia-south1 \
  --project="$GCP_PROJECT_ID" \
  --update-secrets=DATABASE_URL=craftguru-database-url:latest,RAZORPAY_KEY_ID=craftguru-razorpay-key-id:latest,RAZORPAY_KEY_SECRET=craftguru-razorpay-key-secret:latest
```

**Verify:**

```bash
curl -fsS "${RUN_URL}/api/health"
```

Look for `"reachable": true` under `database`.

**Common mistake:** Creating secrets but forgetting IAM `secretAccessor` on the runtime service account → Cloud Run revision fails to start.

---

# 13. Configure storage

## 13.1 Cloud Storage — **not required** for Craftguru media

This application stores product images primarily as:

1. **Cloudinary HTTPS URLs** in Postgres, or  
2. Paths under `media/` served by Express / CDN  

**You do not need a GCS bucket for the default production path.**

```mermaid
flowchart LR
  Vendor[Vendor pastes Cloudinary URL] --> DB[(Neon)]
  DB --> Shop[Storefront]
  Shop --> CDN[Cloudinary CDN]
```

## 13.2 If you still create a bucket (optional / future)

Only if you later add GCS uploads:

1. ☰ → **Cloud Storage** → **Buckets** → **CREATE**
2. Name globally unique, region `asia-south1`
3. Prefer **uniform bucket-level access**
4. Avoid public-by-default; use signed URLs for private objects

**Screenshot**

> **Insert Screenshot Here**  
> Description: Cloud Storage buckets list — either empty (recommended) or an optional future bucket. Caption: “Not required for current Craftguru image pipeline.”

## 13.3 Cloud SQL — **not applicable**

Do **not** create Cloud SQL. Keep Neon.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Cloud SQL instances page empty, with note overlay: “Database remains on Neon — intentional.”

## 13.4 Cloudinary checklist (verify, don’t migrate)

- [ ] Existing Cloudinary cloud still active  
- [ ] Vendor UI can paste `https://res.cloudinary.com/...`  
- [ ] Storefront `imageUrl()` leaves absolute HTTPS URLs unchanged  
- [ ] No plan to move binaries into Git  

---

# 14. Configure domain

## 14.1 Map `api.YOUR_DOMAIN` to Cloud Run

### Console

1. Cloud Run → `craftguru-api` → **MANAGE CUSTOM DOMAINS** / **Integrations** → Domain mappings  
2. **ADD MAPPING**  
3. Domain: `api.YOUR_DOMAIN`  
4. Follow the DNS instructions shown  

### CLI (beta may vary by SDK version)

```bash
gcloud beta run domain-mappings create \
  --service=craftguru-api \
  --domain=api.YOUR_DOMAIN \
  --region=asia-south1 \
  --project="$GCP_PROJECT_ID"
```

**Screenshot**

> **Insert Screenshot Here**  
> Description: Domain mapping screen showing `api.yourdomain.com` with status “Certificate Provisioning” or “Active”, plus required DNS records.

## 14.2 Point storefront API base at the new domain

```bash
export PUBLIC_BILL_API_BASE="https://api.YOUR_DOMAIN"
cd /Users/deveshjangid/Desktop/resin-boutique
node tools/set-bill-api-base.js
```

Then redeploy Cloudflare Pages / Firebase Hosting / commit patched HTML as your process requires.

**Verify:** View page source — `data-bill-api-base` is the Cloud Run/custom API URL, not `onrender.com`.

---

# 15. Configure SSL

## 15.1 How SSL works on Cloud Run

Google automatically provisions a managed certificate for mapped custom domains. You do not upload a cert manually.

**Wait** until mapping status is Active / Certificate ready (can take minutes to hours).

**Verify:**

```bash
curl -fsSI https://api.YOUR_DOMAIN/health
```

**Expected:** HTTP/2 200 and a valid certificate chain (no browser warning).

**Common mistake:** Turning on Cloudflare orange-cloud proxy too early → cert issuance fails. Start **DNS only**, then enable proxy.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Browser padlock on `https://api.YOUR_DOMAIN/health` showing valid certificate issued to your domain.

---

# 16. Configure Cloudflare

## 16.1 DNS records (typical)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `api` | value from Google domain mapping | Grey cloud until SSL Active |
| CNAME / A / AAAA | `www` | Pages / Firebase / Cloud Run | As per host docs |

## 16.2 SSL/TLS mode

Cloudflare dashboard → your zone → **SSL/TLS** → **Overview** → set encryption mode to **Full (strict)**.

**Why:** Cloudflare ↔ origin must use valid HTTPS.

## 16.3 Cutover tip

Lower TTL to 60–300 seconds 24h before switching records.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Cloudflare DNS list showing `api` CNAME; SSL/TLS overview set to Full (strict).

---

# 17. Logging

## 17.1 What Cloud Logging is

Every `console.log` / `console.error` from the container appears in **Cloud Logging**. Your app also logs HTTP requests via `http-hardening.js`.

## 17.2 View logs — Console

1. ☰ → **Logging** → **Logs Explorer**
2. Resource → **Cloud Run Revision** → service `craftguru-api`
3. Run query

Example filter:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="craftguru-api"
severity>=ERROR
```

**Screenshot**

> **Insert Screenshot Here**  
> Description: Logs Explorer with Cloud Run revision selected and recent request log lines.

## 17.3 View logs — CLI

```bash
gcloud run services logs read craftguru-api \
  --region=asia-south1 \
  --project="$GCP_PROJECT_ID" \
  --limit=50
```

**Verify:** Hitting `/health` produces no error spam; hitting a broken route may produce 4xx/5xx lines.

---

# 18. Monitoring

## 18.1 Metrics

1. Cloud Run → `craftguru-api` → **METRICS** tab  
2. Watch: Request count, latency, container instance count, billable time  

## 18.2 Uptime check (recommended)

1. ☰ → **Monitoring** → **Uptime checks** → **CREATE UPTIME CHECK**  
2. Protocol HTTPS  
3. Hostname `api.YOUR_DOMAIN`  
4. Path `/health`  
5. Check every 5 minutes  

## 18.3 Alerting

1. Monitoring → **Alerting** → **CREATE POLICY**  
2. Condition: Cloud Run → Request latency or error rate  
3. Notification channel: email  

## 18.4 Error Reporting

☰ → **Error Reporting** — Node stack traces (if any) aggregate here.

**Screenshot**

> **Insert Screenshot Here**  
> Description: Cloud Run Metrics graphs + an Uptime check for `/health` in green.

---

# 19. Updating the application

```mermaid
flowchart LR
  Code[git push / local changes] --> Build[Cloud Build or docker build]
  Build --> Push[Artifact Registry]
  Push --> Deploy[New Cloud Run revision]
  Deploy --> Traffic[100% traffic to new revision]
```

### Recommended update path

```bash
cd /Users/deveshjangid/Desktop/resin-boutique
git pull
gcloud builds submit \
  --project="$GCP_PROJECT_ID" \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=asia-south1,_SERVICE=craftguru-api,_AR_REPO=craftguru,_MIN_INSTANCES=0" \
  .
```

**Verify:** Cloud Run → Revisions shows a new revision with 100% traffic; `/health` still OK.

---

# 20. Rollback

## 20.1 Instant traffic rollback

```bash
gcloud run revisions list --service=craftguru-api --region=asia-south1

gcloud run services update-traffic craftguru-api \
  --region=asia-south1 \
  --to-revisions=PREVIOUS_REVISION_NAME=100
```

**What it does:** Routes all traffic to an older healthy revision without rebuilding.

## 20.2 Canary

```bash
gcloud run services update-traffic craftguru-api \
  --region=asia-south1 \
  --to-revisions=NEW_REV=10,OLD_REV=90
```

## 20.3 Full rollback to Render

1. Set storefront `PUBLIC_BILL_API_BASE` back to Render URL  
2. Redeploy Pages/Firebase  
3. Resume Render service  
4. Neon unchanged  

**Screenshot**

> **Insert Screenshot Here**  
> Description: Cloud Run Revisions list with traffic percentages; one older revision set to 100%.

---

# 21. CI/CD from GitHub

## 21.1 What the workflow does

File: `.github/workflows/gcp-deploy.yml`

On push to `main`:

1. Authenticate via Workload Identity Federation  
2. `gcloud builds submit` (API)  
3. Optionally patch HTML + Firebase Hosting  

## 21.2 GitHub secrets to add

Repo → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Purpose |
|--------|---------|
| `GCP_PROJECT_ID` | Project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider resource name |
| `GCP_SERVICE_ACCOUNT` | Deployer SA email |
| `PUBLIC_BILL_API_BASE` | `https://api.YOUR_DOMAIN` |
| `PUBLIC_BILL_CLIENT_SECRET` | Optional |

Follow Workload Identity setup in `infra/gcp/GCLOUD-COMMANDS.md` / Google’s GitHub Actions docs.

**Screenshot**

> **Insert Screenshot Here**  
> Description: GitHub Actions run for “Deploy to Google Cloud” with green checks; GitHub Secrets list (names only).

---

# 22. Cost optimisation

## 22.1 Recommended low-traffic settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| CPU | 1 | Enough for Express + occasional PDF |
| Memory | 1Gi | Safer for `sharp` / PDF bills (512Mi possible if no heavy media work) |
| Min instances | **0** | Pay nothing when idle |
| Max instances | 5–10 | Cap spend |
| Concurrency | 80 | Fewer instances for same load |
| Timeout | 300s | Only as high as needed |
| Region | asia-south1 | Latency for India |

```bash
gcloud run services update craftguru-api \
  --region=asia-south1 \
  --cpu=1 \
  --memory=1Gi \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=300
```

## 22.2 Cost killers to avoid

- Migrating Neon → Cloud SQL unnecessarily  
- `min-instances=1` before you need it  
- Public Cloud Storage of huge assets instead of Cloudinary  
- Leaving unused VM / Kubernetes clusters  

## 22.3 Budget alerts

Billing → Budgets & alerts → $50 / $100 / $200.

---

# 23. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `API not enabled` | Missing API | §5 enable APIs |
| Build fails `npm ci` | Lockfile/out of sync | Run `npm ci` locally in `server/`; commit lockfile |
| Image push denied | Docker not auth’d / IAM | `gcloud auth configure-docker …`; fix Artifact Registry writer |
| Revision failed to start | Secret missing / SA no access | Create secret; grant `secretAccessor` |
| `/health` OK but DB false | Bad `DATABASE_URL` | Use Neon **pooled** URL + `sslmode=require` |
| CORS errors in browser | `ALLOWED_ORIGIN` mismatch | Include exact `https://www…` origins |
| Vendor API 401 | Auth required | Login via vendor portal; check `VENDOR_REQUIRE_AUTH` |
| Custom domain pending forever | Cloudflare proxy early | Grey-cloud DNS until cert Active |
| Cold starts slow | Scale-to-zero | Accept or set `--min-instances=1` |
| Images missing after deploy | Wrote files to container disk | Use Cloudinary URLs |
| Wrong project resources | `gcloud config` project | `gcloud config set project …` |
| Payments fail | Razorpay secrets | Remount live keys; verify `/api/health` razorpayConfigured |
| OTP emails missing | SMTP/Gmail not set | Mount SMTP secrets + `MAIL_FROM` |
| GitHub Actions auth fail | WIF misconfigured | Re-check provider + SA bindings |

**Screenshot**

> **Insert Screenshot Here**  
> Description: Example failed Cloud Run revision “Logs” panel highlighting a secret access error — annotated with the fix.

---

# 24. Final checklist

## Application running
- [ ] Cloud Run service `craftguru-api` exists in `asia-south1`
- [ ] Latest revision is Ready / serving traffic
- [ ] `${RUN_URL}/health` → `{"status":"ok"}`

## API accessible
- [ ] Custom domain `https://api.YOUR_DOMAIN/health` works **or** `*.run.app` works
- [ ] Storefront `data-bill-api-base` points to GCP API
- [ ] No calls to `onrender.com` in production Network tab

## Database works
- [ ] `/api/health` → `database.reachable: true`
- [ ] Orders / vendor data load (Neon unchanged)

## Images
- [ ] Cloudinary URLs render on PDP/category pages
- [ ] No reliance on ephemeral Cloud Run disk for new uploads

## Secrets configured
- [ ] Secret Manager entries exist
- [ ] Cloud Run mounts `DATABASE_URL` + Razorpay (+ optional WhatsApp/SMTP)
- [ ] Nothing secret committed to Git

## Logs visible
- [ ] Logs Explorer shows Cloud Run revision logs
- [ ] `gcloud run services logs read …` works

## Monitoring works
- [ ] Metrics tab shows request traffic after a test hit
- [ ] Optional uptime check green on `/health`

## HTTPS works
- [ ] Browser padlock on API and www
- [ ] Cloudflare SSL mode Full (strict) if proxied

## Cutover complete
- [ ] Render traffic near zero
- [ ] Render suspended 48–72h (not deleted yet)
- [ ] Rollback plan understood
- [ ] Budget alerts enabled

---

# Appendix A — Copy-paste command sheet

```bash
# === Fill once ===
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_REGION=asia-south1
export SERVICE=craftguru-api
export AR_REPO=craftguru
export DOMAIN=YOUR_DOMAIN

gcloud auth login
gcloud config set project "$GCP_PROJECT_ID"
gcloud config set run/region "$GCP_REGION"

gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com

gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="Craftguru" \
  --project="$GCP_PROJECT_ID"

cd /Users/deveshjangid/Desktop/resin-boutique
./infra/gcp/setup-secrets.sh

PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')
for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/secretmanager.secretAccessor roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="$ROLE"
done

gcloud builds submit \
  --project="$GCP_PROJECT_ID" \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=${GCP_REGION},_SERVICE=${SERVICE},_AR_REPO=${AR_REPO},_MIN_INSTANCES=0" \
  .

export RUN_URL=$(gcloud run services describe "$SERVICE" --region="$GCP_REGION" --format='value(status.url)')
curl -fsS "${RUN_URL}/health"
curl -fsS "${RUN_URL}/api/health"
```

---

# Appendix B — Glossary

| Term | Simple meaning |
|------|----------------|
| Cloud Run | Runs your website/API container without managing servers |
| Artifact Registry | Private place to store Docker images |
| Cloud Build | Google builds your Docker image in the cloud |
| Secret Manager | Safe vault for passwords and API keys |
| Neon | Hosted Postgres used by this app (external) |
| Cloudinary | Hosted image CDN used by this app (external) |
| Revision | One deployed version of your Cloud Run service |
| IAM | Who is allowed to do what |
| CORS | Browser rule controlling which websites may call your API |

---

# Appendix C — PDF export

### Pandoc example

Create `docs/pdf-header.tex`:

```tex
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhead[L]{Craftguru · GCP Deployment Guide}
\fancyhead[R]{v1.0}
\fancyfoot[C]{\thepage}
\renewcommand{\headrulewidth}{0.4pt}
```

Then:

```bash
pandoc docs/GCP-COMPLETE-DEPLOYMENT-GUIDE.md \
  -o docs/GCP-COMPLETE-DEPLOYMENT-GUIDE.pdf \
  --toc --toc-depth=3 \
  -V geometry:margin=1in \
  --pdf-engine=xelatex \
  --include-in-header=docs/pdf-header.tex
```

### Screenshot pack (recommended for PDF)

Capture and insert images for:

1. GCP Console home  
2. Billing / Free Trial  
3. APIs Library (Cloud Run enabled)  
4. IAM bindings  
5. Artifact Registry repository  
6. Cloud Build success  
7. Cloud Run service overview  
8. Secret Manager list  
9. Domain mapping Active  
10. Cloudflare DNS + SSL Full Strict  
11. Logs Explorer  
12. Monitoring uptime check  

Label each: **Insert Screenshot Here** → replace with the real PNG before PDF export.

---

## End of guide

You should now be able to deploy Craftguru to Google Cloud Run while keeping **Neon** and **Cloudinary** unchanged, with a documented rollback path to Render.

For shorter operational notes see also:

- `docs/RENDER-TO-GCP-ZERO-DOWNTIME.md`
- `infra/gcp/GCLOUD-COMMANDS.md`
