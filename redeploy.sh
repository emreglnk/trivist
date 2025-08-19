#!/usr/bin/env bash
set -euo pipefail

printf "==> Starting redeploy at %s\n" "$(date -Is)"

# 1) Pull latest code if this is a git repo
if [ -d .git ]; then
  echo "==> Pulling latest from git..."
  git fetch --all --prune || true
  if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
    git pull --rebase --autostash
  else
    echo "No upstream configured; skipping git pull."
  fi
else
  echo "No .git directory; skipping git pull."
fi

# 2) Install dependencies (production-only to reduce memory)
echo "==> Installing dependencies (prod only)..."
if [ -f package-lock.json ]; then
  echo "> npm ci --omit=dev --no-audit --no-fund --progress=false"
  if ! npm ci --omit=dev --no-audit --no-fund --progress=false; then
    echo "npm ci failed, falling back to npm install --omit=dev"
    npm install --omit=dev --no-audit --no-fund --progress=false
  fi
else
  npm install --omit=dev --no-audit --no-fund --progress=false
fi

# 3) Build Next.js app (skip typecheck/lint to reduce memory)
echo "==> Building Next.js app..."
export TSC_COMPILE_ON_ERROR=true
export NEXT_DISABLE_ESLINT=1
export NODE_OPTIONS="--max-old-space-size=1024"
npm run build || {
  echo "First build attempt failed, retrying once..."
  npm run build
}

# 4) Restart services
echo "==> Restarting services..."
sudo systemctl restart trivio
sudo systemctl restart trivio-socket

printf "==> Redeploy completed at %s\n" "$(date -Is)"
