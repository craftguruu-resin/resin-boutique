# Render → Google Cloud migration plan (Craftguru / resin-boutique)

**Status:** Artifacts generated — **do not deploy until you approve this plan.**

This document migrates application hosting from **Render + Cloudflare Pages** to **Google Cloud**, while keeping **Neon PostgreSQL**, **Cloudinary** (image URLs in DB), and your **existing domain/DNS** (typically Cloudflare).

---

## 1. Current stack (auto-detected from repository)

| Layer | Technology | Current host | Notes |
|-------|------------|--------------|-------|
| **Storefront** | Static HTML / JS / CSS (`*.html`, `data.js`, `app.js`, …) | **Cloudflare Pages** | Build: `node tools/set-bill-api-base.js`; output: repo root |
| **API** | Node.js 18+ **Express** (`server/index.js`) | **Render** Web Service | `render.yaml`: root `server/`, `npm install`, `npm start`, health `/api/health` |
| **Database** | **PostgreSQL** via `pg` pool | **Neon** (external) | `DATABASE_URL`; migrations: `npm run db:migrate` |
| **Images** | Bundled `media/` + optional disk uploads + **HTTPS URLs** | Repo + Render disk (paid) / **Cloudinary** | No Cloudinary SDK; URLs stored in Postgres (`imageUrl()` passes through `https://`) |
| **Payments** | Razorpay | Env on Render | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| **Email OTP** | Nodemailer (SMTP / Gmail) | Env on Render | `SMTP_*` or `GMAIL_*` |
| **WhatsApp bills** | Meta Graph API | Env on Render | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| **Auth** | Vendor session + Google Sign-In + guest OTP | Server | `VENDOR_PORTAL_*`, `GOOGLE_CLIENT_ID`, `BILL_API_SECRET` |
| **Background jobs** | — | **None** | No `cron`, workers, or `setInterval` batch jobs in `server/` |
| **CI/CD** | — | **Manual** via Render / Cloudflare dashboards | No `.github/workflows` today |

**Render blueprint:** `render.yaml` (free tier, Oregon, health check).

**Local dev:** `server/docker-compose.local.yml` (Postgres only).

---

## 2. Recommended GCP architecture (cost-optimized)

```
                    ┌─────────────────────────────────────┐
                    │  Your domain (Cloudflare DNS)       │
                    │  www.craftguruindia.com → Hosting   │
                    │  api.craftguruindia.com → Cloud Run │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
 ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 │ Firebase Hosting │    │   Cloud Run     │    │  Neon Postgres  │
 │  (static shop)   │───▶│  craftguru-api  │───▶│   (unchanged)   │
 │  CDN + SSL       │    │  Express API    │    │  DATABASE_URL   │
 └─────────────────┘    └────────┬────────┘    └─────────────────┘
                                   │
                          ┌────────┴────────┐
                          │ Secret Manager  │
                          │ Artifact Reg.   │
                          │ Cloud Build     │
                          │ Cloud Logging   │
                          └─────────────────┘

  Cloudinary (unchanged) ◀── browsers load https://res.cloudinary.com/... directly
```

### Why this split

| Service | Role | Cost profile |
|---------|------|--------------|
| **Cloud Run** (`craftguru-api`) | API only; scales to **zero** | Pay per request; **$0 idle** with `min-instances=0` |
| **Firebase Hosting** | CDN for ~378 MB `media/` + HTML/JS | Generous free tier; cheap egress vs serving static from Run |
| **Artifact Registry** | Docker images | ~$0.10/GB/month stored |
| **Cloud Build** | CI builds | 120 free build-min/min/day |
| **Secret Manager** | All secrets | Pennies at this traffic |
| **Cloud Scheduler** | Not needed | No cron jobs in app |

### Alternative (fastest cutover, higher static cost)

**Single Cloud Run** serves API + static (Express already does `express.static(siteRoot)`). Point apex/`www` at Cloud Run. Simpler DNS, but **no CDN** for 378 MB media — higher egress and cold starts affect the whole site.

**Recommendation:** Use **Firebase Hosting + Cloud Run API** (matches today’s Pages + Render split).

---

## 3. Free $300 credits strategy

1. Create a **new GCP billing account** linked to the trial ($300 / 90 days typical).
2. Deploy with **`min-instances=0`** on Cloud Run (no always-on charge).
3. Use **Firebase Hosting** free tier for storefront (10 GB storage, 360 MB/day transfer included).
4. Keep **Neon free tier** (unchanged) — no GCP database cost.
5. Keep **Cloudinary** (unchanged) — prefer Cloudinary URLs for new vendor uploads (Cloud Run disk is ephemeral).
6. Avoid **GCE VMs**, **Cloud SQL**, and **global HTTPS LB** unless you need them later.
7. Set **budget alerts** at $50 / $100 / $200 in Billing → Budgets.

Estimated burn during trial: **< $30/month** at moderate traffic → credits last well beyond migration.

---

## 4. Post-credits monthly cost estimate

Assumptions: ~5k–20k page views/month, API ~50k requests/month, 1–2 deploys/week.

| Item | Est. monthly (USD) |
|------|-------------------|
| Cloud Run (API, scale-to-zero) | $3 – $12 |
| Firebase Hosting (within free tier) | $0 – $5 |
| Artifact Registry (~2 GB images) | $0.20 – $0.50 |
| Cloud Build (within free minutes) | $0 – $2 |
| Secret Manager + Logging | $0 – $3 |
| Neon Postgres | $0 – $19 (your Neon plan) |
| Cloudinary | $0 (your plan) |
| Cloudflare DNS | $0 (unchanged) |
| **GCP subtotal** | **~$8 – $25** |

Adding **`min-instances=1`** (eliminate API cold starts) adds roughly **$25–40/month** — optional after launch.

---

## 5. Secrets → Secret Manager mapping

Copy values from **Render Environment** into Secret Manager (never commit values).

| Secret Manager ID | Env var | Source today |
|-------------------|---------|--------------|
| `craftguru-database-url` | `DATABASE_URL` | Neon pooled URL |
| `craftguru-razorpay-key-id` | `RAZORPAY_KEY_ID` | Render |
| `craftguru-razorpay-key-secret` | `RAZORPAY_KEY_SECRET` | Render |
| `craftguru-whatsapp-access-token` | `WHATSAPP_ACCESS_TOKEN` | Render |
| `craftguru-whatsapp-phone-number-id` | `WHATSAPP_PHONE_NUMBER_ID` | Render |
| `craftguru-bill-api-secret` | `BILL_API_SECRET` | Render (if used) |
| `craftguru-guest-otp-pepper` | `GUEST_OTP_PEPPER` | Render (if set) |
| `craftguru-google-client-id` | `GOOGLE_CLIENT_ID` | Render |
| `craftguru-smtp-pass` | `SMTP_PASS` or `GMAIL_APP_PASSWORD` | Render |
| `craftguru-vendor-portal-password` | `VENDOR_PORTAL_PASSWORD` | Render |

**Non-secret env** (set on Cloud Run directly — see `infra/gcp/env.cloudrun.yaml`):

- `NODE_ENV=production`
- `ALLOWED_ORIGIN=https://www.yourdomain.com,https://yourdomain.com`
- `VENDOR_REQUIRE_AUTH=1`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM`, `GMAIL_USER` (non-secret parts)
- `META_GRAPH_VERSION=v21.0` (optional)

**Cloudinary:** No server env vars — URLs live in Postgres. Keep using Cloudinary dashboard; no migration.

**Firebase build secret** (GitHub / Cloud Build): `PUBLIC_BILL_API_BASE=https://api.yourdomain.com`, optional `PUBLIC_BILL_CLIENT_SECRET`.

---

## 6. DNS & SSL (keep Cloudflare)

| Record | Type | Target |
|--------|------|--------|
| `www` | CNAME | Firebase Hosting (`your-project.web.app` or custom hosting target) |
| `api` | CNAME | Cloud Run mapped URL (after `gcloud run domain-mappings create`) |

SSL: **Firebase Hosting** and **Cloud Run** provide managed certs. With **Cloudflare proxy (orange cloud)** enabled, use **Full (strict)** SSL mode.

Update `ALLOWED_ORIGIN` and `PUBLIC_BILL_API_BASE` to production URLs before cutover.

---

## 7. Pre-migration improvements (recommended before go-live)

| Area | Issue today | GCP action |
|------|-------------|------------|
| **Media persistence** | Render free tier loses uploads | Use **Cloudinary HTTPS URLs** for all vendor images; avoid relying on `UPLOADED_MEDIA_ROOT` on Cloud Run |
| **Vendor auth** | Defaults on when `RENDER=true` | Set `VENDOR_REQUIRE_AUTH=1` on Cloud Run (or use `K_SERVICE` detection — see `server/vendor-auth.js`) |
| **CORS** | `ALLOWED_ORIGIN=*` in dev | Set explicit production origins |
| **Cold starts** | Render free tier slow wake | Accept scale-to-zero or set `min-instances=1` for API |
| **Caching** | Static on Pages CDN | Firebase Hosting `firebase.json` cache headers for `media/`, `*.js`, `*.css` |
| **SEO** | Static HTML | Unchanged; ensure `www` canonical URLs in Firebase |
| **Security** | Secrets in Render UI | Secret Manager + least-privilege SA for Cloud Build |
| **Observability** | Render logs | Cloud Logging + optional uptime check on `/api/health` |
| **DB pool** | `PG_POOL_MAX=10` | Fine for Cloud Run; Neon pooled URL recommended |

---

## 8. Migration phases (approval required per phase)

### Phase A — GCP project setup (manual, ~30 min)

1. Create GCP project `craftguru-prod` (or your name).
2. Enable APIs: Run, Build, Artifact Registry, Secret Manager, Firebase Hosting, IAM.
3. Run `infra/gcp/setup-secrets.sh` (paste Render values interactively).
4. Create Artifact Registry repo `craftguru`.
5. Connect GitHub → Cloud Build trigger (or use GitHub Actions workflow).

### Phase B — Deploy API to Cloud Run (staging URL)

1. `gcloud builds submit --config cloudbuild.yaml` (or push to `main` with CI).
2. Verify `https://craftguru-api-xxxxx-uc.a.run.app/api/health` → `database.reachable: true`.
3. **Do not** run `db:migrate` again if Neon already migrated.

### Phase C — Deploy frontend to Firebase Hosting (staging)

1. Set `PUBLIC_BILL_API_BASE` to Cloud Run URL (or `api.` subdomain).
2. `npm run pages:patch-api` then `firebase deploy --only hosting`.
3. Test checkout, vendor login, catalog merge, Razorpay (small live payment).

### Phase D — DNS cutover

1. Lower TTL on Cloudflare records 24h before.
2. Point `api` → Cloud Run; `www` → Firebase.
3. Update `ALLOWED_ORIGIN` and rebuild frontend with final API URL.
4. Monitor logs 48h; keep Render service **suspended** (not deleted) for rollback.

### Phase E — Decommission Render / Pages

After 1–2 weeks stable: delete Render web service; remove Cloudflare Pages project.

---

## 9. Rollback plan

- Repoint Cloudflare DNS back to Render + Pages (keep old env vars).
- Neon unchanged — no DB rollback needed.
- Redeploy last known good Render commit if needed.

---

## 10. Files added by this migration

| File | Purpose |
|------|---------|
| `Dockerfile` | Cloud Run container (API + bundled static fallback) |
| `.dockerignore` | Slim image |
| `cloudbuild.yaml` | Build → Artifact Registry → Cloud Run |
| `cloudbuild.hosting.yaml` | Patch HTML + Firebase deploy |
| `firebase.json` | Hosting config + cache headers |
| `.firebaserc` | Firebase project alias (edit `YOUR_FIREBASE_PROJECT_ID`) |
| `infra/gcp/env.cloudrun.yaml` | Non-secret Cloud Run env |
| `infra/gcp/setup-secrets.sh` | Create Secret Manager secrets |
| `infra/gcp/deploy-manual.sh` | One-shot manual deploy |
| `.github/workflows/gcp-deploy.yml` | Auto-deploy from `main` |

---

## 11. Approval checklist

Before executing deployment commands, confirm:

- [ ] GCP project ID and billing account ready
- [ ] Firebase project linked (Hosting enabled)
- [ ] Neon `DATABASE_URL` copied to Secret Manager
- [ ] Razorpay **live** keys migrated
- [ ] Target domain names for `www` and `api`
- [ ] Cloudflare DNS access for cutover
- [ ] `ALLOWED_ORIGIN` final values agreed
- [ ] Rollback window acceptable

**Reply “approved” with your GCP project ID and domain names to proceed with guided cutover.**

---

## 12. Exact gcloud commands

See **[infra/gcp/GCLOUD-COMMANDS.md](../infra/gcp/GCLOUD-COMMANDS.md)** for copy-paste commands (project setup, secrets, deploy, DNS, GitHub WIF, monitoring, rollback).

Quick start after approval:

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=asia-south1
./infra/gcp/setup-secrets.sh
./infra/gcp/deploy-manual.sh
```
