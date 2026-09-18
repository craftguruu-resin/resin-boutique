# Multi-stage production image for Craftguru (Express API + static storefront).
# Target: Google Cloud Run · asia-south1 · PORT 8080
# Neon + Cloudinary stay external.

# ── Stage 1: install production deps (includes native sharp build tools) ─────
FROM node:22-bookworm-slim AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 2: slim runtime ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends libvips42 ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs craftguru

WORKDIR /app

COPY --from=deps /app/server/node_modules ./server/node_modules
COPY . .

# Critical storefront fixes are applied after bump-html-assets.js so the
# build-generated cache-busting query string is preserved. Match asset paths,
# not old hard-coded versions, because the build step changes ?v=.
# The Home scroll guard intentionally loads synchronously from <head> so it
# registers before browser pageshow/history restoration can move the viewport.
RUN sed -i 's#</head>#<link rel="stylesheet" href="hero-final.css?v=20260917g" /><link rel="stylesheet" href="home-shop-category-final.css?v=20260917g" /><link rel="stylesheet" href="home-first-paint.css?v=20260916a" /><link rel="stylesheet" href="home-layout-final.css?v=20260916b" /><script src="home-first-load.js?v=20260916c"></script></head>#' index.html raw-material-shop.html \
  && sed -i -E 's#media/home-showcase/home-ethereal-hero-clock1.webp\?v=[^" ]+#media/home-showcase/home-hero-craftguru.webp?v=20260915a#g' index.html \
  && sed -i -E 's#media/home-showcase/home-ethereal-hero-clock1\.png\?v=[^" ]+#media/home-showcase/home-hero-craftguru.webp?v=20260915a#g' index.html \
  && sed -i -E 's#media/raw-material-showcase/rm-hero-panel\.png\?v=[^" ]+#media/raw-material-showcase/rm-hero-panel.png?v=20260915a#g' raw-material-shop.html

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app/server
USER craftguru
EXPOSE 8080

CMD ["node", "index.js"]
