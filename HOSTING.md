# Hosting (Neon + Render + Cloudflare Pages)

I cannot log into your accounts or click Deploy for you. Follow the steps below; use support chat on each provider if something fails.

## Architecture

| Part | Where | Role |
|------|--------|------|
| Postgres | **Neon** (or any Postgres) | `DATABASE_URL` — set on **Render** for prod; on your **Mac** use `server/.env` (gitignored). Same variable name, two places. See **`server/LOCAL-AND-PROD-DATABASE.md`**. |
| Node API + same-origin fallback | **Render** Web Service (`server/`) | REST, Razorpay, vendor auth, serves repo static files if you open the Render URL |
| Public shop + fast CDN | **Cloudflare Pages** | Static HTML/JS/CSS/media from Git |

Browsers on your domain load Pages; they call the API on Render via `data-bill-api-base` (patched at build time).

---

## 1) Neon

1. Copy the **pooled** connection string (recommended for serverless-style pools; Render is long-lived but pooled is still fine).
2. Append SSL if your dashboard shows it: often `?sslmode=require` is already in the string.

You will paste this as `DATABASE_URL` on Render.

---

## 2) Render (API)

1. Push this repo to **GitHub** (if it is not already).
2. [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service** → Connect the repository.
3. Configure:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance type**: Free is OK for testing (cold starts after idle).
4. **Environment** — add at least (names from `server/.env.example`):

   | Variable | Notes |
   |----------|--------|
   | `DATABASE_URL` | Neon connection string |
   | `ALLOWED_ORIGIN` | After Pages exists: `https://YOUR.pages.dev,https://yourdomain.com` (comma-separated, no spaces). Until then you may use `*` for a quick test. |
   | `BILL_API_SECRET` | Optional; if set, checkout/vendor HTML must send the same secret (see Cloudflare step). |
   | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | **Live** keys from Razorpay Dashboard (Live mode) — see §4 below |
   | SMTP / Gmail vars | For guest OTP email (see `.env.example`) |

5. **Save environment variables**  
   - Click **Save**, **Apply**, or confirm the dialog so Render stores every key.  
   - If the service already existed, Render usually **starts a new deploy** automatically. If not: open the service → **Manual Deploy** → **Deploy latest commit**.

---

### Render — Step 5: First deploy (logs & build)

1. Open your **Web Service** on Render (the one with **Root Directory** `server`).
2. Click the **Logs** tab at the top. Leave it open while the deploy runs.
3. **Build phase** (first time can take a few minutes):
   - You should see `npm install` running, then `sharp` / native modules compiling if needed.
   - **Failure:** note the **red** error line (often missing `package.json` if Root Directory is wrong, or Node version). Fix **Root Directory** = `server`, **Build** = `npm install`, **Start** = `npm start`.
4. **Start phase** after build succeeds:
   - Look for a line like `Craftguru server on http://127.0.0.1:PORT` (Render sets `PORT` internally; that log is normal).
   - If you see Postgres / `DATABASE_URL` errors, the connection string is wrong or Neon is paused — fix `DATABASE_URL` in **Environment** and redeploy.

When the dashboard shows **Live** (green), continue to **Step 6** below.

---

### Render — Step 6: Verify the API (health check)

1. At the top of your Web Service page, copy the **public URL** (e.g. `https://craftguru-api.onrender.com`).  
   - On **Free** tier, the first request after idle can take **30–60 seconds** (cold start). Wait, then retry.
2. In your browser, open (replace with your URL):

   `https://YOUR-SERVICE.onrender.com/api/health`

3. **Success:** you should see **JSON** with `"ok": true`. Check **`database.reachable`**: it should be **`true`** when `DATABASE_URL` is correct and Neon accepts connections. **`emailConfigured`** is `true` when Gmail/SMTP env vars are valid enough to create a mail transport.
4. **If you see HTML or “Application not responding”:** open **Logs** again; scroll for the latest error. Common causes: crash on startup, wrong `DATABASE_URL`, or deploy still running.

Optional quick checks (same base URL):

- `GET /api/health` — already above.  
- After migrations (next section), you can load `https://YOUR-SERVICE.onrender.com/index.html` to confirm the Node app is also serving static files from the repo (same-origin test before Cloudflare).

---

### Render — Step 7: Run database migrations **once** (Neon)

Your Neon database is empty of **app tables** until you run the migration script **against that same `DATABASE_URL`**.

**Option A — From your Mac (simplest if `server/.env` already has `DATABASE_URL`)**

```bash
cd /path/to/resin-boutique/server
npm install
npm run db:migrate
```

Use the **same** `DATABASE_URL` value as on Render (Neon string). If the command prints success and no duplicate errors, you’re done.

**Option B — From Render Shell (no local copy of secrets)**

1. Render dashboard → your Web Service → **Shell** (left sidebar; available when the instance is running).
2. You start in the repo; `cd server` if needed (depends on Render’s shell cwd — often project root).
3. Run:

   ```bash
   cd server && npm run db:migrate
   ```

4. Read the output: errors about “relation already exists” may be OK if you re-ran; fatal auth errors mean `DATABASE_URL` in Render env doesn’t match Neon.

**Optional seed** (only if you use catalog seeding from this project):

```bash
cd server && npm run db:seed
```

After **7**, guest orders, OTP tables, and vendor tables expected by this codebase should exist on Neon.

---

## 3) Cloudflare Pages (storefront)

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → Connect Git.
2. Select the same repo. Production branch: usually `main`.
3. **Build configuration:**
   - **Framework preset**: None
   - **Build command**: `node tools/set-bill-api-base.js`
   - **Build output directory**: `.` (repository root after the script patches HTML in place)
4. **Environment variables (Production):**

   | Name | Value |
   |------|--------|
   | `PUBLIC_BILL_API_BASE` | `https://YOUR-SERVICE.onrender.com` (no trailing slash) |
   | `PUBLIC_BILL_CLIENT_SECRET` | Only if you set `BILL_API_SECRET` on Render — paste the **same** value so the build can fill `data-bill-api-secret` on HTML |

5. Save and deploy. Open the `*.pages.dev` URL and test checkout on **HTTPS**.

6. **Custom domain:** Pages → Custom domains → add `www` (or apex). In DNS, follow Cloudflare’s records.

7. **Tighten CORS:** On Render, set `ALLOWED_ORIGIN` to your real site origins (Pages URL + custom domain), not `*`.

---

## 4) Razorpay (live payments on your domain)

Checkout uses **Razorpay Standard Checkout** (`checkout.js` + `https://checkout.razorpay.com/v1/checkout.js`). The server creates an order (`POST /api/razorpay-order`), the customer pays in Razorpay’s widget, then the browser calls `POST /api/razorpay-verify` with the payment signature so the server can create the paid order. No test “skip payment” path is shipped in the app.

1. **Activate Razorpay for live money**  
   In [Razorpay Dashboard](https://dashboard.razorpay.com/), complete **KYC / business activation** so **Live** mode is enabled (not only Test).

2. **Create Live API keys**  
   Toggle **Live** (top of dashboard) → **Account & Settings** → **API Keys** → **Generate Key**. Copy **Key ID** (`rzp_live_…`) and **Key Secret** once (secret is shown only at creation; regenerate if lost).

3. **Put keys on Render** (same Web Service as `server/`)  
   **Environment** → add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (Live values) → save / redeploy.  
   Do **not** commit secrets to Git.

4. **CORS / origin**  
   Set `ALLOWED_ORIGIN` to your real storefront origins (comma-separated, no spaces), e.g. `https://www.craftguruindia.com,https://craftguruindia.com` so the browser on your domain can call `/api/razorpay-order` and `/api/razorpay-verify`.

5. **Same host vs split host**  
   If the storefront is opened from the **same** URL as the API (e.g. only Render: `https://your-service.onrender.com/checkout.html`), same-origin avoids CORS issues. If you use a static host + API host, ensure `data-bill-api-base` on checkout matches the API origin and `ALLOWED_ORIGIN` includes the static site origin.

6. **`BILL_API_SECRET`** (optional)  
   If set on the server, `checkout.html` must have the same value on `data-bill-api-secret` on the `<html>` element (and rebuild Pages if you inject it at build time).

7. **Webhooks (optional for this codebase)**  
   This repo does **not** expose a Razorpay webhook URL; orders are recorded when `/api/razorpay-verify` succeeds in the browser. For extra reliability (e.g. if the user closes the tab before verify completes), you could add a webhook handler later in the server and register its **HTTPS** URL under Razorpay → **Webhooks** → use your public API base (e.g. `https://www.craftguruindia.com/api/...` once implemented).

8. **Smoke test**  
   After deploy: open checkout on **HTTPS**, use a **small real** UPI/card payment, confirm order appears in your DB / vendor flow. Use Razorpay Dashboard → **Payments** to reconcile.

---

## 5) Optional: storefront only on Render (skip Cloudflare for a day)

If you want **one** URL for everything first: use only the Render Web Service, then open:

`https://YOUR-SERVICE.onrender.com/index.html`

Same machine serves API + static files, so you do **not** need `PUBLIC_BILL_API_BASE` on a separate static host. Add Cloudflare Pages later when you want a CDN and a nicer `www` domain in front of Render.

---

## Repo tools

- `tools/set-bill-api-base.js` — rewrites root `*.html` dev API markers when `PUBLIC_BILL_API_BASE` is set (Cloudflare build).
- `render.yaml` — optional Blueprint for Render (`server` root, health check `/api/health`).

If you tell me your Git branch name and whether you use `BILL_API_SECRET`, the checklist can be narrowed to a 5-line “do this next” list.
