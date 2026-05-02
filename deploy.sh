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
sleep 2
curl -fsS http://127.0.0.1:3001/api/health

echo '>>> done'
