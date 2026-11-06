# Sekawan Board

Aplikasi manajemen tugas fullstack untuk UTS mata kuliah **Pengembangan dan Operasi** (DevOps).
Dikerjakan oleh kelompok **Lima Sekawan**. Aplikasi di-deploy dengan **container (Docker / Podman)**
dan **CI/CD GitHub Actions** ke VPS.

| Lapisan   | Teknologi                                   |
|-----------|----------------------------------------------|
| Frontend  | React 18 + Vite, disajikan oleh Nginx        |
| Backend   | Node.js 22 + Express (REST API, JWT)         |
| Database  | PostgreSQL 16                                |
| Container | Docker / Podman, Docker Compose              |
| CI/CD     | GitHub Actions, GitHub Container Registry    |

## Fitur

1. **Autentikasi**: registrasi dan login dengan JWT, password di-hash (bcrypt)
2. **CRUD tugas**: judul, deskripsi, prioritas, tenggat, status
3. **Papan tugas** tiga kolom dengan *drag and drop* dan tombol pindah status
4. **Kategori berwarna** per pengguna
5. **Pencarian, filter** (prioritas, kategori, status), dan paginasi API
6. **Dashboard statistik**: persentase progres, tugas terlambat, tenggat 7 hari, rekap per prioritas dan kategori
7. **Health check** `/api/health` untuk monitoring container

## Arsitektur

```
Browser ──► frontend (Nginx :8080) ──/api──► backend (Express :3000) ──► db (PostgreSQL :5432)
             │ file statis React              │ jaringan app-net          └ volume pgdata
             └ jaringan app-net               └ jaringan db-net (internal)
```

Hanya port frontend yang dibuka ke host. Database berada di jaringan `internal` sehingga tidak bisa diakses dari luar.

## Struktur proyek

```
.
├── backend/                  # REST API
│   ├── src/                  #   app.js, server.js, db.js, auth.js, validate.js, config.js
│   ├── test/api.test.js      #   integration test (node:test + PostgreSQL)
│   └── Dockerfile            #   multi-stage, user non-root
├── frontend/                 # Single Page Application
│   ├── src/                  #   pages/, components/, api.js, styles.css
│   ├── nginx.conf            #   serve SPA + reverse proxy /api
│   └── Dockerfile            #   multi-stage: build Vite -> Nginx unprivileged
├── deploy/deploy.sh          # skrip deploy di VPS (Docker/Podman + rollback otomatis)
├── docker-compose.yml        # pengembangan lokal (build dari source)
├── docker-compose.prod.yml   # produksi (pull image dari GHCR)
├── .github/workflows/ci-cd.yml
└── .env.example
```

## Menjalankan secara lokal

Prasyarat: Docker (atau Podman) dengan Compose.

```bash
cp .env.example .env          # lalu ubah password dan JWT_SECRET
docker compose up -d --build  # atau: podman compose up -d --build
```

Buka http://localhost:8080, daftar akun baru, lalu mulai membuat tugas.

```bash
docker compose ps             # status + health tiap container
docker compose logs -f backend
docker compose down           # hentikan (data tetap ada di volume pgdata)
docker compose down -v        # hentikan dan HAPUS data database
```

### Tanpa container (opsional, untuk development)

```bash
# terminal 1: backend (butuh PostgreSQL lokal)
cd backend && npm install
DATABASE_URL=postgres://user:pass@localhost:5432/sekawan_board npm start
# terminal 2: frontend (proxy /api -> localhost:3000)
cd frontend && npm install && npm run dev      # http://localhost:5173
```

### Menjalankan test

```bash
cd backend && npm ci
DATABASE_URL=postgres://user:pass@localhost:5432/sekawan_board_test npm test
```

## Docker dan Podman

File Dockerfile dan compose yang sama bekerja di keduanya; nama image ditulis lengkap
(`docker.io/library/...`) agar Podman tidak perlu konfigurasi registry tambahan.

| Aksi            | Docker                          | Podman                          |
|-----------------|---------------------------------|---------------------------------|
| Build image     | `docker build -t x ./backend`   | `podman build -t x ./backend`   |
| Jalankan stack  | `docker compose up -d`          | `podman compose up -d`          |
| Lihat container | `docker ps`                     | `podman ps`                     |
| Log             | `docker logs backend`           | `podman logs backend`           |

Catatan Podman rootless: port host harus >= 1024 (default 8080 sudah aman). Pasang provider
compose terbaru (`pipx install podman-compose`) agar `depends_on` + healthcheck berfungsi.

## Pipeline CI/CD

File: `.github/workflows/ci-cd.yml`

| Tahap | Job                   | Isi                                                                  |
|-------|-----------------------|----------------------------------------------------------------------|
| CI    | `test-backend`        | 13 integration test terhadap PostgreSQL (service container)          |
| CI    | `build-frontend`      | `npm ci` dan `npm run build`                                         |
| CI    | `compose-smoke-test`  | `docker compose up --build`, cek `/api/health`, uji registrasi       |
| CI    | `podman-verify`       | build image dan jalankan stack dengan Podman                         |
| CD    | `build-and-push`      | build image final dan push ke `ghcr.io` (tag SHA + `latest`)         |
| CD    | `deploy`              | SSH ke VPS, jalankan `deploy.sh`, health check, rollback bila gagal  |

Job `build-and-push` dan `deploy` hanya berjalan pada push ke branch `main`.
Pull request hanya menjalankan tahap CI.

## Menyiapkan VPS (sekali saja)

Contoh untuk Ubuntu 22.04/24.04. Jalankan sebagai root.

```bash
# 1. user khusus deploy
adduser --disabled-password --gecos "" deploy

# 2a. jika memakai Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# 2b. jika memakai Podman
apt update && apt install -y podman curl pipx
sudo -u deploy pipx install podman-compose
loginctl enable-linger deploy                                  # container tetap jalan setelah logout
sudo -u deploy XDG_RUNTIME_DIR=/run/user/$(id -u deploy) systemctl --user enable --now podman-restart.service

# 3. firewall
ufw allow OpenSSH && ufw allow 8080/tcp && ufw enable
```

Buat pasangan kunci SSH khusus deploy (di laptop):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N ""
ssh-copy-id -i deploy_key.pub deploy@IP_VPS      # kunci publik ke VPS
cat deploy_key                                   # isi kunci privat -> secret VPS_SSH_KEY
```

## Konfigurasi GitHub (Settings -> Secrets and variables -> Actions)

**Secrets**

| Nama                | Isi                                                      |
|---------------------|----------------------------------------------------------|
| `VPS_HOST`          | IP atau domain VPS                                       |
| `VPS_USER`          | `deploy`                                                 |
| `VPS_SSH_KEY`       | isi **kunci privat** (`deploy_key`) lengkap dengan header |
| `POSTGRES_PASSWORD` | password database produksi (huruf dan angka saja)        |
| `JWT_SECRET`        | hasil `openssl rand -hex 32`                             |
| `VPS_PORT`          | (opsional) port SSH bila bukan 22                        |
| `GHCR_PAT`          | (opsional) Personal Access Token `read:packages` bila VPS tidak bisa menarik image privat |

**Variables** (opsional): `APP_PORT` (default 8080), `CONTAINER_RUNTIME` (`docker` atau `podman`).
Runtime juga bisa dipilih manual saat menjalankan workflow dari tab **Actions -> Run workflow**.

Setelah itu, `git push origin main` akan memicu seluruh pipeline.

## Rollback

- **Otomatis**: bila health check gagal setelah deploy, `deploy.sh` langsung menjalankan kembali tag sebelumnya (tersimpan di `~/sekawan-board/.deployed_tag`) dan job `deploy` ditandai gagal.
- **Manual lewat GitHub**: buka tab **Actions**, pilih run dari commit yang stabil, lalu **Re-run all jobs**.
- **Manual lewat VPS** (image lama masih tersimpan di cache lokal):

```bash
cd ~/sekawan-board
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG='TAG_LAMA'/" .env     # tag SHA 7 karakter, lihat tab Packages di GitHub
docker compose -f docker-compose.prod.yml up -d          # atau: podman compose -f ...
```

## Pemecahan masalah

| Gejala                                      | Penyebab dan solusi                                                                 |
|---------------------------------------------|-------------------------------------------------------------------------------------|
| `denied` saat `pull` image di VPS           | Paket GHCR privat. Ubah visibilitas menjadi public, atau isi secret `GHCR_PAT`       |
| Job deploy gagal di langkah SSH             | Periksa `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (harus kunci privat utuh) dan firewall |
| Nginx: `host not found in upstream backend` | Backend belum jalan saat Nginx start; `restart: always` akan mengulang otomatis      |
| Backend terus restart                       | `docker compose logs backend`: biasanya `JWT_SECRET`/`DATABASE_URL` salah            |
| Curl dari luar VPS gagal                    | Buka port aplikasi di firewall (`ufw allow 8080/tcp`) dan panel cloud provider       |
