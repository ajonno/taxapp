#!/usr/bin/env bash
#
# Deploy the Taxapp client (Firebase Hosting) and/or server (DigitalOcean
# droplet via SSH).
#
# Usage:
#   ./deploy.sh           # deploy both client and server
#   ./deploy.sh client    # client only (Firebase Hosting)
#   ./deploy.sh server    # server only (rsync + pm2 restart)
#   ./deploy.sh -h        # show help
#
# Requirements:
#   - npm + firebase CLI on PATH
#   - SSH access to the droplet (key already added to your agent)
#
set -euo pipefail

# ---- Config -----------------------------------------------------------------
DROPLET_HOST="root@134.199.174.129"
DROPLET_PATH="/opt/taxapp"
# PM2 process name — confirm with `pm2 list` on the droplet. Set to "all"
# to restart every pm2-managed process if the specific name ever drifts.
PM2_NAME="taxapp"

# Resolve the repo root no matter where the script is called from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- Pretty output ----------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  BLUE=$'\033[34m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; BLUE=""; RED=""; RESET=""
fi
step()  { printf "\n${BLUE}${BOLD}▶ %s${RESET}\n" "$*"; }
ok()    { printf "${GREEN}✔ %s${RESET}\n" "$*"; }
warn()  { printf "${YELLOW}⚠ %s${RESET}\n" "$*"; }
fail()  { printf "${RED}✘ %s${RESET}\n" "$*" >&2; }

usage() {
  sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e 's/^# \{0,1\}//' -e '/^set -euo/d'
  exit 0
}

# ---- Targets ----------------------------------------------------------------
deploy_client() {
  step "Building client (Vite)"
  cd "$REPO_ROOT/client"
  npm run build
  ok "Build complete"

  step "Deploying to Firebase Hosting"
  npx firebase deploy --only hosting
  ok "Client deployed → https://mytax-aj.web.app"
}

deploy_server() {
  step "Syncing server source to droplet"
  # rsync the whole server source tree (excluding node_modules / uploads) so
  # any edited file gets picked up, not just routes/transactions.ts.
  rsync -avz --delete \
    --exclude node_modules \
    --exclude uploads \
    --exclude dist \
    --exclude .env \
    "$REPO_ROOT/server/" "$DROPLET_HOST:$DROPLET_PATH/server/"
  ok "Source synced"

  step "Restarting pm2 process: $PM2_NAME"
  ssh "$DROPLET_HOST" "pm2 restart $PM2_NAME && pm2 status $PM2_NAME"
  ok "Server restarted"
}

# ---- Dispatch ---------------------------------------------------------------
target="${1:-all}"
case "$target" in
  -h|--help|help) usage ;;
  client)         deploy_client ;;
  server)         deploy_server ;;
  all|"")         deploy_client; deploy_server ;;
  *)              fail "Unknown target: $target (use client | server | all)"; exit 1 ;;
esac

printf "\n${GREEN}${BOLD}✓ Done.${RESET}\n"
