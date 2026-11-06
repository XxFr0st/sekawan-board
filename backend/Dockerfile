# syntax=docker/dockerfile:1
# ---- Stage 1: install dependency produksi saja ----
# Nama image ditulis lengkap (docker.io/...) agar Docker dan Podman
# sama-sama bisa menariknya tanpa konfigurasi registry tambahan.
FROM docker.io/library/node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Stage 2: image runtime yang ramping ----
FROM docker.io/library/node:22-alpine
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Jalankan sebagai user non-root (user "node" sudah tersedia di image resmi)
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
