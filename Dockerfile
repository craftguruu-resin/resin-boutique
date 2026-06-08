# Craftguru API + static fallback (mirrors Render: Express serves repo root).
# Production: Firebase Hosting (static CDN) + Cloud Run (this image, API).
# Cloud Run listens on PORT (default 8080).

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libvips42 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
WORKDIR /app/server
EXPOSE 8080

CMD ["node", "index.js"]
