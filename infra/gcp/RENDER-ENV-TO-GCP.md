# Render environment variables → Google Cloud (craft-guru-production)

Use this when migrating from Render to GCP **without changing production DNS yet**.
Render stays live until you manually cut over.

## Your Render variables (from dashboard)

| Render variable | Where to set on GCP | Secret Manager name | Cloud Run env name |
|-----------------|---------------------|---------------------|-------------------|
| `DATABASE_URL` | **Secret Manager** | `craftguru-database-url` | `DATABASE_URL` |
| `GMAIL_APP_PASSWORD` | **Secret Manager** | `craftguru-smtp-pass` | `GMAIL_APP_PASSWORD` |
| `GMAIL_USER` | **Cloud Run env** (not secret) | — | `GMAIL_USER` |
| `GOOGLE_CLIENT_ID` | **Secret Manager** | `craftguru-google-client-id` | `GOOGLE_CLIENT_ID` |
| `MAIL_FROM` | **Cloud Run env** (not secret) | — | `MAIL_FROM` |
| `VENDOR_PORTAL_PASSWORD` | **Secret Manager** | `craftguru-vendor-portal-password` | `VENDOR_PORTAL_PASSWORD` |
| `VENDOR_PORTAL_USER` | **Cloud Run env** (not secret) | — | `VENDOR_PORTAL_USER` |

Also copy from Render if present (checkout / WhatsApp / vendor API lock):

| Render variable | Secret Manager | Cloud Run env |
|-----------------|----------------|---------------|
| `RAZORPAY_KEY_ID` | `craftguru-razorpay-key-id` | `RAZORPAY_KEY_ID` |
| `RAZORPAY_KEY_SECRET` | `craftguru-razorpay-key-secret` | `RAZORPAY_KEY_SECRET` |
| `WHATSAPP_ACCESS_TOKEN` | `craftguru-whatsapp-access-token` | `WHATSAPP_ACCESS_TOKEN` |
| `WHATSAPP_PHONE_NUMBER_ID` | `craftguru-whatsapp-phone-number-id` | `WHATSAPP_PHONE_NUMBER_ID` |
| `BILL_API_SECRET` | `craftguru-bill-api-secret` | `BILL_API_SECRET` |
| `GUEST_OTP_PEPPER` | `craftguru-guest-otp-pepper` | `GUEST_OTP_PEPPER` |

## Cloudinary

**No Cloudinary environment variables** are required on the server. Product and category images are
`https://res.cloudinary.com/...` URLs stored in Neon PostgreSQL. Uploads from the vendor portal
use those URLs directly. Do not migrate images to Google Cloud Storage.

## Option A — Script (recommended)

```bash
export GCP_PROJECT_ID=craft-guru-production
export GCP_REGION=asia-south1

# Paste the same values as Render (example — use your real values):
export DATABASE_URL='postgresql://...'
export GMAIL_APP_PASSWORD='...'
export GMAIL_USER='you@gmail.com'
export MAIL_FROM='Craftguru <you@gmail.com>'
export GOOGLE_CLIENT_ID='....apps.googleusercontent.com'
export VENDOR_PORTAL_PASSWORD='...'
export VENDOR_PORTAL_USER='nammu'
# Optional:
export RAZORPAY_KEY_ID='rzp_live_...'
export RAZORPAY_KEY_SECRET='...'

./infra/gcp/bootstrap-project.sh
./infra/gcp/setup-secrets.sh
```

Then set non-secret env vars on Cloud Run:

```bash
gcloud run services update craftguru-api \
  --project=craft-guru-production \
  --region=asia-south1 \
  --update-env-vars="GMAIL_USER=you@gmail.com,MAIL_FROM=Craftguru <you@gmail.com>,VENDOR_PORTAL_USER=nammu"
```

Or edit `infra/gcp/env.cloudrun.yaml` (uncomment `GMAIL_USER` / `MAIL_FROM`) and redeploy.

## Option B — Google Cloud Console

### Secret Manager

1. Console → **Security** → **Secret Manager**
2. Create each secret (or use **setup-secrets.sh**)
3. Grant **Secret Manager Secret Accessor** to the default compute service account:
   `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`

### Cloud Run

1. Console → **Cloud Run** → `craftguru-api` → **Edit & deploy new revision**
2. **Variables & secrets** tab:
   - **Secrets**: reference Secret Manager names as in table above
   - **Environment variables**: `GMAIL_USER`, `MAIL_FROM`, `VENDOR_PORTAL_USER`

## Parallel testing (no DNS change)

After deploy:

```bash
./infra/gcp/post-deploy-update-origins.sh
```

This adds your stable Cloud Run URL to `ALLOWED_ORIGIN` so the storefront on `*.run.app` can call the API.

**Frontend options:**

1. **Same Cloud Run service** — open `https://craftguru-api-....run.app/` (API + static HTML in one container)
2. **Firebase Hosting** — `https://craft-guru-production.web.app` after:
   ```bash
   export PUBLIC_BILL_API_BASE=https://your-cloud-run-url.run.app
   ./infra/gcp/deploy-manual.sh
   ```

Production on Render (`craftguru.co.in`) is unchanged until you update DNS.
