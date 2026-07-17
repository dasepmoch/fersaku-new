#!/usr/bin/env bash
# BE-630 launch bootstrap: migrate up, optional seed, verify health/metrics/synthetic.
# Safe for local compose and staging jobs. Does not print secret values.
#
# Usage:
#   ./scripts/launch_bootstrap.sh
#   BASE_URL=http://127.0.0.1:18080 BOOTSTRAP_ADMIN_EMAIL=admin@example.com ./scripts/launch_bootstrap.sh
#
# Env:
#   DATABASE_URL   default local compose postgres :5433
#   BASE_URL       default http://127.0.0.1:18080
#   SKIP_MIGRATE=1 SKIP_SEED=1 SKIP_HEALTH=1 SKIP_SYNTHETIC=1
#   BOOTSTRAP_ADMIN_EMAIL  optional SUPER_ADMIN attach (user must exist)
#   EVIDENCE_DIR   optional write log copy

set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.local/go/bin:${HOME}/.local/bin:${PATH:-}"
DATABASE_URL="${DATABASE_URL:-postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable}"
BASE_URL="${BASE_URL:-http://127.0.0.1:18080}"
export DATABASE_URL
export BASE_URL

STAMP="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%Y%m%dT%H%M%S)"
EVIDENCE_DIR="${EVIDENCE_DIR:-}"
LOG_FILE=""
if [[ -n "$EVIDENCE_DIR" ]]; then
  mkdir -p "$EVIDENCE_DIR"
  LOG_FILE="$EVIDENCE_DIR/02-launch-bootstrap.txt"
fi

log() {
  printf '%s\n' "$*"
  if [[ -n "$LOG_FILE" ]]; then
    printf '%s\n' "$*" >>"$LOG_FILE"
  fi
}

log "=== Fersaku BE-630 launch_bootstrap ==="
log "time_utc=$STAMP"
log "root=$ROOT"
log "base_url=$BASE_URL"
log "database_url_set=$([ -n "$DATABASE_URL" ] && echo yes || echo no)"
log ""

# --- migrate ---
if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  log "--- migrate up ---"
  if [[ -n "$LOG_FILE" ]]; then
    ./scripts/migrate.sh up 2>&1 | tee -a "$LOG_FILE"
    ./scripts/migrate.sh version 2>&1 | tee -a "$LOG_FILE"
  else
    ./scripts/migrate.sh up
    ./scripts/migrate.sh version
  fi
  log "migrate: OK"
else
  log "migrate: skipped"
fi

# --- seed (system roles from migration; optional SUPER_ADMIN) ---
if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  log "--- seed ---"
  if [[ -n "$LOG_FILE" ]]; then
    ./scripts/seed.sh 2>&1 | tee -a "$LOG_FILE"
  else
    ./scripts/seed.sh
  fi
  log "seed: OK"
else
  log "seed: skipped"
fi

# --- health / metrics ---
if [[ "${SKIP_HEALTH:-0}" != "1" ]]; then
  log "--- health / metrics ---"
  live=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/health/live" || echo "000")
  ready=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/health/ready" || echo "000")
  metrics=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/metrics" || echo "000")
  log "health_live=$live health_ready=$ready metrics=$metrics"
  if [[ "$live" != "200" || "$ready" != "200" || "$metrics" != "200" ]]; then
    log "launch_bootstrap: FAIL health/metrics"
    exit 1
  fi
  log "health: OK"
else
  log "health: skipped"
fi

# --- synthetic ---
if [[ "${SKIP_SYNTHETIC:-0}" != "1" ]]; then
  log "--- synthetic_health ---"
  export MAILPIT_URL="${MAILPIT_URL:-http://127.0.0.1:8025}"
  if [[ -n "$LOG_FILE" ]]; then
    ./scripts/synthetic_health.sh 2>&1 | tee -a "$LOG_FILE"
  else
    ./scripts/synthetic_health.sh
  fi
  log "synthetic: OK"
else
  log "synthetic: skipped"
fi

log ""
log "launch_bootstrap: OK"
log "admin bootstrap: register/verify user then BOOTSTRAP_ADMIN_EMAIL=... ./scripts/seed.sh (see docs/launch/readiness-checklist.md)"
exit 0
