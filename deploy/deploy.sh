#!/usr/bin/env bash
# =============================================================================
# deploy.sh - dijalankan DI VPS oleh job "deploy" pada GitHub Actions.
#
# Tugas: menarik image terbaru, menjalankan ulang container, memastikan aplikasi
# sehat, dan ROLLBACK otomatis ke versi sebelumnya bila deploy gagal.
#
# Mendukung Docker maupun Podman (pilih lewat CONTAINER_RUNTIME di file .env).
# Pemakaian:
#   bash deploy.sh                 # registry publik / sudah login
#   echo "$TOKEN" | GHCR_USER=nama bash deploy.sh --login-stdin
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
STATE_FILE=".deployed_tag"
log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; }

[ -f .env ] || { err "File .env tidak ditemukan di $(pwd)"; exit 1; }
set -a; . ./.env; set +a

# ---- 1. Tentukan runtime container: docker atau podman -----------------------
RUNTIME="${CONTAINER_RUNTIME:-docker}"
command -v "$RUNTIME" >/dev/null 2>&1 || { err "$RUNTIME tidak terpasang di server ini"; exit 1; }

# ---- 2. Tentukan perintah compose yang tersedia ------------------------------
if [ "$RUNTIME" = "docker" ]; then
  COMPOSE="docker compose"
elif podman compose version >/dev/null 2>&1; then
  COMPOSE="podman compose"
elif command -v podman-compose >/dev/null 2>&1; then
  COMPOSE="podman-compose"
else
  err "Podman terpasang tetapi 'podman compose' / 'podman-compose' tidak ditemukan"; exit 1
fi
log "Runtime: $RUNTIME | Compose: $COMPOSE | Tag: ${IMAGE_TAG}"

# ---- 3. Login ke registry (token dikirim lewat stdin, tidak tersimpan di file) -
if [ "${1:-}" = "--login-stdin" ]; then
  [ -n "${GHCR_USER:-}" ] || { err "GHCR_USER belum diisi"; exit 1; }
  log "Login ke ghcr.io sebagai ${GHCR_USER}"
  "$RUNTIME" login ghcr.io -u "$GHCR_USER" --password-stdin
fi

# ---- 4. Fungsi bantu ----------------------------------------------------------
wait_healthy() {
  local url="http://127.0.0.1:${APP_PORT:-8080}/api/health"
  local tries="${HEALTH_TRIES:-30}" interval="${HEALTH_INTERVAL:-3}"
  log "Menunggu aplikasi sehat di $url"
  for i in $(seq 1 "$tries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then log "Aplikasi sehat (percobaan $i)"; return 0; fi
    sleep "$interval"
  done
  return 1
}

bring_up() {  # $1 = tag image
  IMAGE_TAG="$1" $COMPOSE -f "$COMPOSE_FILE" pull
  IMAGE_TAG="$1" $COMPOSE -f "$COMPOSE_FILE" up -d --remove-orphans
}

PREVIOUS_TAG=""
[ -f "$STATE_FILE" ] && PREVIOUS_TAG="$(cat "$STATE_FILE")"

# ---- 5. Deploy versi baru -----------------------------------------------------
log "Deploy tag baru: ${IMAGE_TAG} (sebelumnya: ${PREVIOUS_TAG:-belum ada})"
if bring_up "$IMAGE_TAG" && wait_healthy; then
  echo "$IMAGE_TAG" > "$STATE_FILE"
  log "Deploy berhasil"
else
  err "Deploy gagal. Log terakhir:"
  $COMPOSE -f "$COMPOSE_FILE" logs --tail=40 || true
  # ---- 6. Rollback otomatis -------------------------------------------------
  if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$IMAGE_TAG" ]; then
    err "Rollback ke versi sebelumnya: $PREVIOUS_TAG"
    bring_up "$PREVIOUS_TAG" && wait_healthy && err "Rollback berhasil, aplikasi kembali ke $PREVIOUS_TAG"
  else
    err "Tidak ada versi sebelumnya untuk rollback"
  fi
  exit 1
fi

# ---- 7. Bersih-bersih image lama ----------------------------------------------
"$RUNTIME" image prune -f >/dev/null 2>&1 || true
$COMPOSE -f "$COMPOSE_FILE" ps
