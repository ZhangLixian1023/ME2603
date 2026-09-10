#!/usr/bin/env bash
set -euo pipefail

LOCK=/var/lock/me2603-deploy.lock
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[deploy] another deployment is in progress, aborting" >&2
  exit 1
fi

cd /var/www/ME2603
LOCAL_BEFORE=$(git rev-parse HEAD)
echo "[deploy] HEAD before fetch: ${LOCAL_BEFORE:0:7}"

git fetch origin main --quiet
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL_BEFORE" = "$REMOTE" ]; then
  echo "[deploy] no new commits on main (HEAD=${LOCAL_BEFORE:0:7}), skipping build"
  exit 0
fi

echo "[deploy] new commits detected: ${LOCAL_BEFORE:0:7} -> ${REMOTE:0:7}"
git pull --ff-only

# An empty commit (or one that only touches non-tracked files) can still
# advance HEAD without changing any tracked content. Skip the rebuild
# in that case so a no-op push doesn't bounce the service.
if git diff --quiet HEAD@{1} HEAD; then
  echo "[deploy] HEAD advanced but no tracked files changed, skipping build"
  exit 0
fi

echo "[deploy] pnpm install"
pnpm install --frozen-lockfile

echo "[deploy] pnpm build"
pnpm build

echo "[deploy] restarting pm2"
pm2 delete me2603 2>/dev/null || true
set -a
. ./.env
set +a
pm2 start "pnpm start" --name me2603 --cwd /var/www/ME2603

echo "[deploy] done"
pm2 status me2603