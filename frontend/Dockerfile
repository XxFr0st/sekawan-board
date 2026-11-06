# syntax=docker/dockerfile:1
# ---- Stage 1: build aset statis React dengan Vite ----
FROM docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: sajikan hasil build dengan Nginx (non-root, port 8080) ----
FROM docker.io/nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
