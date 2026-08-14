# Cloud CDN on Global HTTPS Load Balancer

Craftguru uses **Google Cloud Global HTTPS Load Balancer + Cloud CDN** in front of Cloud Run — not Firebase Hosting.

## Architecture

```
Browser → Global HTTPS LB (Cloud CDN) → Serverless NEG → Cloud Run (craftguru-api)
```

- **HTML** (`/`, `/index.html`, `*.html`): `Cache-Control: no-cache` — always fresh, SSR homepage.
- **Versioned static** (`*.js?v=`, `*.css?v=`, images with `?v=`): `max-age=31536000, immutable` — CDN + browser long cache.
- **API** (`/api/*`): `no-store` — never cached at CDN.
- **Media** (`/media/*`): origin headers + optional `?w=&f=webp` optimizer; CDN respects `Cache-Control`.

## Setup

```bash
./infra/gcp/setup-global-lb.sh
```

Point DNS A records for `craftguruindia.com`, `www.craftguruindia.com`, and `craftguru.co.in` to the global IP.

## CDN configuration (via `setup-global-lb.sh`)

| Setting | Value |
|---------|--------|
| `enable-cdn` | true |
| `cache-mode` | `USE_ORIGIN_HEADERS` |
| `compression-mode` | `AUTOMATIC` (gzip/br at edge) |
| `negative-caching` | false (API/HTML never poisoned) |

## Invalidation strategy

1. **Preferred:** bump `?v=YYYYMMDD` on JS/CSS in HTML — new URL = new cache key, no purge needed.
2. **HTML:** always `no-cache` — deploy instantly visible.
3. **Emergency purge:** `gcloud compute url-maps invalidate-cdn-cache craftguru-url-map --path="/styles.css" --global`

## Why not Firebase Hosting?

- Single origin (Cloud Run) simplifies SSR homepage, API, and media optimizer.
- Global LB + CDN caches static assets at edge with same `Cache-Control` headers already set in `server/http-hardening.js`.
- No duplicate deploy pipeline or split cache invalidation.

## Verification

```bash
curl -sI https://craftguruindia.com/styles.css?v=20260816 | grep -i cache-control
curl -sI https://craftguruindia.com/ | grep -i cache-control
curl -sI https://craftguruindia.com/api/health | grep -i cache-control
```

Expect: HTML `no-cache`, versioned CSS `immutable`, API `no-store`.
