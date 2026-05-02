#!/usr/bin/env bash
# Deployed to /var/www/tablecraft/deploy.sh on the Seoul box.
# Invoked by .github/workflows/deploy.yml via SSH.
set -euo pipefail

cd /var/www/tablecraft

echo '>>> fetch'
git fetch --all --prune
git reset --hard origin/main

echo '>>> install'
pnpm install --frozen-lockfile

echo '>>> build'
pnpm build

echo '>>> migrate'
pnpm --filter @repo/server db:migrate

echo '>>> reload'
pm2 reload tablecraft --update-env

echo '>>> status'
pm2 status tablecraft
echo '>>> health'
# pm2 reload can take 10-15s on tsx cold start; retry up to 30s
for i in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
    curl -s http://127.0.0.1:3001/api/health
    echo
    echo '>>> done'
    exit 0
  fi
  sleep 2
done
echo 'health check timed out after 30s' >&2
exit 1
