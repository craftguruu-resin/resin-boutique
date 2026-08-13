# Craft Guru — Performance optimization (GCP Cloud Run)

## Root causes identified

| Area | Issue | Impact |
|------|--------|--------|
| **Cold starts** | `min-instances=0`, 1 vCPU / 1 Gi | First request after idle ~1–2s+ (categories API ~1.6s cold) |
| **Client catalog merge** | 3 sequential `fetch` with `cache: "no-store"` on every page | Blocked render; ignored server `Cache-Control` |
| **Tab visibility** | Full catalog refresh on every `visibilitychange` | Repeated API load when switching tabs |
| **Cloudinary** | Full-size delivery URLs (`f_auto,q_auto` missing) | Large LCP images on PDP and listings |
| **API cache** | In-memory cache worked but client bypassed browser cache | Duplicate network round-trips |
| **Docker image** | `android/` (~67 MB) in build context | Slower image pull / startup |
| **DB pool** | `PG_POOL_MAX=5` vs concurrency 80 | Pool contention under load |
| **Logging** | Every request logged in production | Minor CPU overhead on hot paths |

## Cloud Run production configuration (recommended)

| Setting | Before | After |
|---------|--------|-------|
| CPU | 1 | **2** |
| Memory | 1 Gi | **2 Gi** |
| Min instances | 0 | **1** (eliminates idle cold starts) |
| Max instances | 20 | **30** |
| Concurrency | 80 | **40** (better latency per request) |
| CPU boost | on | on |
| Execution env | gen2 | gen2 |
| Session affinity | on | **removed** (better load spread) |
| Timeout | 300s | 300s |
| Startup probe | 5s initial | **3s initial** |

Env (`infra/gcp/env.cloudrun.yaml`):

- `PG_POOL_MAX=10`
- `CATALOG_API_CACHE_MS=120000` (2 min in-memory catalog JSON cache)

## Files modified (performance)

- `catalog-merge.js` — parallel fetches, session cache, debounced visibility refresh
- `data.js` — Cloudinary `f_auto,q_auto` (+ optional width)
- `app.js`, `category.js`, `product.js` — responsive image widths, hero cache-friendly fetch
- `guest-layout.js` — Cloudinary preconnect
- `index.html` — Cloudinary preconnect
- `server/api-response-cache.js` — cache TTL aligned with env
- `server/http-hardening.js` — production logs only slow/error requests
- `server/index.js` — catalog routes allow CDN/browser cache headers
- `cloudbuild.yaml`, `infra/gcp/deploy-manual.sh`, `infra/gcp/env.cloudrun.yaml`
- `.dockerignore` — exclude `android/`
- `firebase.json` — longer JS/CSS cache when using Firebase Hosting CDN
- `*.html` — cache-bust `data.js` / `catalog-merge.js`

## Benchmarking

Run before/after deploy:

```bash
BASE=https://craftguru-api-329259882406.asia-south1.run.app
for path in /health /index.html /api/catalog/categories /api/catalog/vendor-products /api/catalog/price-overrides; do
  curl -s -o /dev/null -w "$path %{time_total}s\n" -H "Accept-Encoding: gzip" "$BASE$path"
done
```

Repeat catalog endpoints — second request should show `X-Cache: HIT` and ~80–100ms.

Lighthouse: run against production URL in Chrome DevTools (mobile + desktop).

## Render sync

After merge to `main`, Render auto-deploys from Git (see `render.yaml`). No Render config removed.
