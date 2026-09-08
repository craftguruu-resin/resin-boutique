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

# App source (filtered by .dockerignore)
COPY . .

# The hero must be deterministic at build time. Do not rely on CSS content:
# replacement, old preload URLs, or browser cache to select the artwork.
# Inject one final, cache-busted stylesheet after every other stylesheet and
# point both page HTML files directly at their intended baked hero assets.
RUN sed -i \
      '/<\\/head>/i\  <link rel="stylesheet" href="hero-final.css?v=20260908a" />' \
      index.html raw-material-shop.html \
  && sed -i \
      's#media/home-showcase/home-ethereal-hero-clock1.webp?v=20260815b 1280w#media/home-showcase/home-hero-craftguru.webp?v=20260908a 1672w#g' \
      index.html \
  && sed -i \
      's#media/home-showcase/home-ethereal-hero-clock1.png?v=1785349343#media/home-showcase/home-hero-craftguru.webp?v=20260908a#g' \
      index.html \
  && sed -i \
      's/width="1536" height="1024"/width="1672" height="941"/g' \
      index.html \
  && sed -i \
      's#media/raw-material-showcase/rm-hero-panel.png?v=1785349343#media/raw-material-showcase/rm-hero-panel.png?v=20260908a#g' \
      raw-material-shop.html

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app/server
USER craftguru
EXPOSE 8080

CMD ["node", "index.js"]
