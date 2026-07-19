#!/usr/bin/env sh
# Run SQL migrations with golang-migrate (migrate identity, not app identity).
# See migrations/README.md for role separation.
#
# Production-safe (GAP-06):
#   - Default command is forward-only `up`.
#   - Destructive commands (down/drop/force/goto) refused when APP_ENV=production|staging
#     unless break-glass: MIGRATE_BREAK_GLASS_TOKEN matches MIGRATE_BREAK_GLASS_EXPECTED
#     and CI is not set (CI=true|1 blocks break-glass).
#   - Local DATABASE_URL fallback only when APP_ENV is empty|local|test.
#   - Audit line: version, actor/job, duration, result (no secrets).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
MIGRATIONS_PATH="${MIGRATIONS_PATH:-$ROOT/migrations}"
APP_ENV="$(printf '%s' "${APP_ENV:-local}" | tr '[:upper:]' '[:lower:]')"
CMD="${1:-up}"
shift "$(( $# > 0 ? 1 : 0 ))" 2>/dev/null || true

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S)"
START_EPOCH="$(date +%s 2>/dev/null || echo 0)"
ACTOR="${MIGRATE_ACTOR:-${GITHUB_ACTOR:-${USER:-unknown}}}"
JOB="${MIGRATE_JOB_ID:-${GITHUB_RUN_ID:-${HOSTNAME:-local}}}"
RESULT="pending"
VERSION_BEFORE=""
VERSION_AFTER=""

write_audit() {
  end_epoch="$(date +%s 2>/dev/null || echo 0)"
  duration=0
  if [ "$START_EPOCH" != "0" ] && [ "$end_epoch" != "0" ]; then
    duration=$((end_epoch - START_EPOCH))
  fi
  line="migrate_audit time=${STARTED_AT} app_env=${APP_ENV} command=${CMD} actor=${ACTOR} job=${JOB} version_before=${VERSION_BEFORE:-none} version_after=${VERSION_AFTER:-none} duration_sec=${duration} result=${RESULT}"
  printf '%s\n' "$line" >&2
  if [ -n "${MIGRATE_AUDIT_LOG:-}" ]; then
    printf '%s\n' "$line" >>"$MIGRATE_AUDIT_LOG"
  fi
}

on_exit() {
  rc=$?
  if [ "$RESULT" = "pending" ]; then
    if [ "$rc" -eq 0 ]; then
      RESULT="ok"
    else
      RESULT="failed"
    fi
  fi
  write_audit
  exit "$rc"
}
trap on_exit EXIT

is_live_env() {
  case "$APP_ENV" in
    production|staging) return 0 ;;
    *) return 1 ;;
  esac
}

is_ci() {
  case "${CI:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
  esac
  case "${GITHUB_ACTIONS:-}" in
    1|true|TRUE) return 0 ;;
  esac
  return 1
}

break_glass_ok() {
  # Explicit dual-token match; never activatable in CI.
  if is_ci; then
    return 1
  fi
  expected="${MIGRATE_BREAK_GLASS_EXPECTED:-}"
  token="${MIGRATE_BREAK_GLASS_TOKEN:-}"
  if [ -z "$expected" ] || [ -z "$token" ]; then
    return 1
  fi
  # Reject trivial tokens so ALLOW_DESTRUCTIVE=1 style cannot slip through.
  if [ "$token" = "$expected" ] && [ "$token" != "1" ] && [ "$token" != "true" ] && [ "$token" != "yes" ]; then
    return 0
  fi
  return 1
}

refuse_destructive() {
  cmd="$1"
  if is_live_env; then
    if break_glass_ok; then
      echo "migrate: WARNING break-glass allowing destructive command=$cmd app_env=$APP_ENV (not CI)" >&2
      return 0
    fi
    echo "migrate: REFUSED command=$cmd on APP_ENV=$APP_ENV (forward-only; set MIGRATE_BREAK_GLASS_TOKEN+MIGRATE_BREAK_GLASS_EXPECTED outside CI for emergency)" >&2
    RESULT="refused"
    exit 2
  fi
}

if [ -z "${DATABASE_URL:-}" ]; then
  if is_live_env; then
    echo "migrate: DATABASE_URL required when APP_ENV=$APP_ENV (no local fallback)" >&2
    RESULT="refused"
    exit 2
  fi
  # Local compose host default (BE-002 ports). Never used on staging/production.
  DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
  export DATABASE_URL
  echo "migrate: using local DATABASE_URL fallback (APP_ENV=$APP_ENV)" >&2
fi

# Reject obvious local compose URLs on production.
if [ "$APP_ENV" = "production" ]; then
  case "$DATABASE_URL" in
    *fersaku_local*|*localhost:5433*|*@localhost*|*@127.0.0.1*)
      echo "migrate: REFUSED local/compose DATABASE_URL when APP_ENV=production" >&2
      RESULT="refused"
      exit 2
      ;;
  esac
fi

MIGRATE_BIN="${MIGRATE_BIN:-}"
if [ -z "$MIGRATE_BIN" ]; then
  if command -v migrate >/dev/null 2>&1; then
    MIGRATE_BIN="$(command -v migrate)"
  elif [ -x "$HOME/.local/bin/migrate" ]; then
    MIGRATE_BIN="$HOME/.local/bin/migrate"
  else
    echo "migrate: golang-migrate binary not found. Install to \$HOME/.local/bin:" >&2
    echo "  curl -sSL https://github.com/golang-migrate/migrate/releases/download/v4.18.3/migrate.linux-amd64.tar.gz | tar -xz -C \"\$HOME/.local/bin\" migrate" >&2
    RESULT="failed"
    exit 1
  fi
fi

# Optional pre-flight: lock timeout for migrate session (ms).
if [ -n "${MIGRATE_LOCK_TIMEOUT_MS:-}" ]; then
  export PGOPTIONS="${PGOPTIONS:-} -c lock_timeout=${MIGRATE_LOCK_TIMEOUT_MS}"
fi

echo "migrate: path=$MIGRATIONS_PATH command=$CMD app_env=$APP_ENV actor=$ACTOR job=$JOB" >&2

# Capture version before (best-effort; ignore dirty/no-table errors).
VERSION_BEFORE="$("$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" version 2>/dev/null || true)"
if [ -z "$VERSION_BEFORE" ]; then
  VERSION_BEFORE="unknown"
fi

case "$CMD" in
  up)
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" up "$@"
    ;;
  down)
    refuse_destructive down
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" down "${1:-1}"
    ;;
  drop)
    refuse_destructive drop
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" drop -f
    ;;
  version)
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" version
    ;;
  force)
    refuse_destructive force
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" force "$@"
    ;;
  goto)
    refuse_destructive goto
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" goto "$@"
    ;;
  *)
    echo "usage: migrate.sh [up|down|drop|version|force|goto] [args...]" >&2
    echo "  production/staging: only up|version unless break-glass tokens set (blocked in CI)" >&2
    RESULT="usage"
    exit 2
    ;;
esac

VERSION_AFTER="$("$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" version 2>/dev/null || true)"
if [ -z "$VERSION_AFTER" ]; then
  VERSION_AFTER="unknown"
fi
RESULT="ok"
echo "migrate: done"
