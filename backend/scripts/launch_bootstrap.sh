#!/usr/bin/env bash
# BE-630 launch bootstrap: migrate up, optional seed, verify health/metrics/synthetic.
# Safe for local compose and staging jobs. Production is fail-closed (no seed, no local URL).
#
# Usage:
#   ./scripts/launch_bootstrap.sh
#   BASE_URL=http://127.0.0.1:18080 BOOTSTRAP_ADMIN_EMAIL=admin@example.com ./scripts/launch_bootstrap.sh
#   BOOTSTRAP_MODE=production SKIP_SEED=1 DATABASE_URL=... ./scripts/launch_bootstrap.sh
#
# Env:
#   APP_ENV / BOOTSTRAP_MODE  local|staging|production (default local)
#   DATABASE_URL   required on staging/production; local default compose :5433
#   BASE_URL       default http://127.0.0.1:18080
#   SKIP_MIGRATE=1 SKIP_SEED=1 SKIP_HEALTH=1 SKIP_SYNTHETIC=1
#   BOOTSTRAP_ADMIN_EMAIL  optional SUPER_ADMIN attach (user must exist; nonprod seed only)
#   EVIDENCE_DIR   optional write log copy

set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.local/go/bin:${HOME}/.local/bin:${PATH:-}"

APP_ENV="$(printf '%s' "${APP_ENV:-${BOOTSTRAP_MODE:-local}}" | tr '[:upper:]' '[:lower:]')"
export APP_ENV
BOOTSTRAP_MODE="${BOOTSTRAP_MODE:-$APP_ENV}"

BASE_URL="${BASE_URL:-http://127.0.0.1:18080}"
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

is_production() { [[ "$APP_ENV" == "production" || "$BOOTSTRAP_MODE" == "production" ]]; }
is_live() { [[ "$APP_ENV" == "production" || "$APP_ENV" == "staging" ]]; }

# --- production-safe defaults ---
if is_production; then
  # Never seed demo personas in production.
  SKIP_SEED=1
  export SKIP_SEED
  if [[ -z "${DATABASE_URL:-}" ]]; then
    log "launch_bootstrap: FAIL DATABASE_URL required when APP_ENV=production (no local fallback)"
    exit 2
  fi
  case "$DATABASE_URL" in
    *fersaku_local*|*localhost:5433*|*@localhost*|*@127.0.0.1*)
      log "launch_bootstrap: FAIL local/compose DATABASE_URL forbidden when APP_ENV=production"
      exit 2
      ;;
  esac
elif is_live; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    log "launch_bootstrap: FAIL DATABASE_URL required when APP_ENV=$APP_ENV (no local fallback)"
    exit 2
  fi
  # Staging: seed only if explicitly allowed (default skip for safety).
  if [[ -z "${SKIP_SEED:-}" ]]; then
    SKIP_SEED=1
    export SKIP_SEED
    log "launch_bootstrap: staging default SKIP_SEED=1 (set SKIP_SEED=0 to seed disposable staging only)"
  fi
else
  # Local: allow compose default URL.
  DATABASE_URL="${DATABASE_URL:-postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable}"
fi
export DATABASE_URL

log "=== Fersaku BE-630 launch_bootstrap ==="
log "time_utc=$STAMP"
log "root=$ROOT"
log "app_env=$APP_ENV bootstrap_mode=$BOOTSTRAP_MODE"
log "base_url=$BASE_URL"
log "database_url_set=$([ -n "$DATABASE_URL" ] && echo yes || echo no)"
log "skip_seed=${SKIP_SEED:-0} skip_migrate=${SKIP_MIGRATE:-0}"
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

# --- seed (refused on production; staging default skip) ---
if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  if is_production; then
    log "launch_bootstrap: FAIL seed attempted on production (impossible path)"
    exit 2
  fi
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

# --- synthetic (local/staging only; production operators use deploy-gate) ---
if [[ "${SKIP_SYNTHETIC:-0}" != "1" ]]; then
  if is_production; then
    log "synthetic: skipped on production (use scripts/release/deploy-gate.sh)"
  else
    log "--- synthetic_health ---"
    export MAILPIT_URL="${MAILPIT_URL:-http://127.0.0.1:8025}"
    if [[ -n "$LOG_FILE" ]]; then
      ./scripts/synthetic_health.sh 2>&1 | tee -a "$LOG_FILE"
    else
      ./scripts/synthetic_health.sh
    fi
    log "synthetic: OK"
  fi
else
  log "synthetic: skipped"
fi

log ""
log "launch_bootstrap: OK"
if ! is_production; then
  log "admin bootstrap: register/verify user then BOOTSTRAP_ADMIN_EMAIL=... ./scripts/seed.sh (nonprod only)"
fi
exit 0
