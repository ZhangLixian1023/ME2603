#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

APP_DIR="${1:-/var/www/ME2603}"
APP_DIR="$(readlink -f -- "${APP_DIR}")"
APP_ENV="${APP_DIR}/.env"
MINIO_IMAGE='quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z'

if [[ ! -d "${APP_DIR}" || ! -f "${APP_ENV}" ]]; then
  echo "Expected an existing application and .env at ${APP_DIR}." >&2
  exit 1
fi

if ! id minio-user >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/minio --shell /usr/sbin/nologin minio-user
fi
install -d -o minio-user -g minio-user -m 0750 /var/lib/minio

if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install --yes docker.io
fi
systemctl enable --now docker

MINIO_ROOT_USER='quizminio'
MINIO_ROOT_PASSWORD="$(openssl rand -hex 32)"
if [[ -f /etc/default/minio ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/default/minio
  set +a
fi
: "${MINIO_ROOT_USER:=quizminio}"
: "${MINIO_ROOT_PASSWORD:=$(openssl rand -hex 32)}"

CONFIG_TEMP="$(mktemp)"
chmod 0600 "${CONFIG_TEMP}"
printf '%s\n' \
  "MINIO_ROOT_USER=${MINIO_ROOT_USER}" \
  "MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}" \
  > "${CONFIG_TEMP}"
install -o root -g root -m 0600 "${CONFIG_TEMP}" /etc/default/minio
rm -f -- "${CONFIG_TEMP}"

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep --quiet -- "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

BACKUP_PATH="${APP_ENV}.backup.$(date -u +%Y%m%dT%H%M%SZ)"
cp -a -- "${APP_ENV}" "${BACKUP_PATH}"
upsert_env 'MINIO_ENDPOINT' 'http://127.0.0.1:9000' "${APP_ENV}"
upsert_env 'MINIO_ROOT_USER' "${MINIO_ROOT_USER}" "${APP_ENV}"
upsert_env 'MINIO_ROOT_PASSWORD' "${MINIO_ROOT_PASSWORD}" "${APP_ENV}"
upsert_env 'MINIO_BUCKET' 'quiz-files' "${APP_ENV}"
chmod 0600 "${APP_ENV}"

docker pull "${MINIO_IMAGE}"
if docker container inspect me2603-minio >/dev/null 2>&1; then
  docker rm --force me2603-minio >/dev/null
fi
docker run --detach \
  --name me2603-minio \
  --restart unless-stopped \
  --user "$(id -u minio-user):$(id -g minio-user)" \
  --env-file /etc/default/minio \
  --publish 127.0.0.1:9000:9000 \
  --publish 127.0.0.1:9001:9001 \
  --volume /var/lib/minio:/data \
  "${MINIO_IMAGE}" \
  server --address :9000 --console-address :9001 /data >/dev/null

for _ in $(seq 1 30); do
  if curl --fail --silent 'http://127.0.0.1:9000/minio/health/live' >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent 'http://127.0.0.1:9000/minio/health/live' >/dev/null

cd -- "${APP_DIR}"
pm2 restart me2603

echo "MinIO container is healthy on 127.0.0.1:9000."
echo "Application environment backup: ${BACKUP_PATH}"
echo "The MinIO password remains server-side and was not written to Git."
