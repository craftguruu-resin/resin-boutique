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

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app/server
USER craftguru
EXPOSE 8080

CMD ["node", "index.js"]
