#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${AERO_DIARY_ROOT:-/home/ubuntu/Projects/aero-diary}"
DEPLOY_BRANCH="${AERO_DIARY_BRANCH:-main}"
SERVICE_NAME="${AERO_DIARY_SERVICE:-aero-diary.service}"

git -C "$APP_ROOT" pull --ff-only origin "$DEPLOY_BRANCH"
cd "$APP_ROOT"
pnpm install --frozen-lockfile
pnpm prisma migrate deploy
pnpm build
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl is-active --quiet "$SERVICE_NAME"
curl --fail --silent --show-error http://127.0.0.1:${PORT:-3000}/ > /dev/null
echo "Aero Diary deployment is healthy."
