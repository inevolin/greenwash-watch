#!/usr/bin/env bash
# Runs ON the server. Updates /root/apps/greenwash-watch and restarts ONLY the pm2 app greenwash-watch.
set -euo pipefail
APP_DIR=/root/apps/greenwash-watch
DATA_DIR=/root/apps/greenwash-watch-data
REF="${1:-main}"
cd "$APP_DIR"
git fetch --quiet origin
git reset --hard "origin/$REF"
mkdir -p "$DATA_DIR"
cp -n data/*.json "$DATA_DIR"/ 2>/dev/null || true   # seed, never overwrite saved reports
test -f .env || { echo "Missing $APP_DIR/.env (ANTHROPIC_API_KEY, AGENT_ID, ENVIRONMENT_ID)"; exit 1; }
if pm2 describe greenwash-watch >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --only greenwash-watch --update-env
else
  pm2 start ecosystem.config.js --only greenwash-watch
fi
pm2 save
for i in $(seq 1 10); do
  curl -fsS http://127.0.0.1:3300/api/health && exit 0
  sleep 1
done
echo "health check failed"; exit 1
