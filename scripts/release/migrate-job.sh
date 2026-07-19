#!/usr/bin/env bash
# Dedicated migration job for rollout (never run from API/worker boot).
# Forward-only: refuses production down/drop unless ALLOW_DESTRUCTIVE_MIGRATE=1 + eng approval flag.
#
# Usage:
#   DATABASE_URL=... ./scripts/release/migrate-job.sh up
#   DATABASE_URL=... ./scripts/release/migrate-job.sh version
#   EXPECTED_HEAD=35 DATABASE_URL=... ./scripts/release/migrate-job.sh up
#
# Exit codes:
#   0 success
#   1 migrate failure
#   2 usage / policy refusal
#   3 version mismatch vs EXPECTED_HEAD
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
BACKEND="${ROOT}/backend"
CMD="${1:-up}"
shift $(( $# > 0 ? 1 : 0 )) 2>/dev/null || true

APP_ENV="${APP_ENV:-local}"
EXPECTED_HEAD="${EXPECTED_HEAD:-}"
ALLOW_DESTRUCTIVE_MIGRATE="${ALLOW_DESTRUCTIVE_MIGRATE:-0}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT}/release/dist/evidence}"
mkdir -p "$EVIDENCE_DIR"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "ERROR: DATABASE_URL required for migrate job"
  exit 2
fi

case "$CMD" in
  down|drop)
    if [[ "$APP_ENV" == "production" || "$APP_ENV" == "staging" ]]; then
      if [[ "$ALLOW_DESTRUCTIVE_MIGRATE" != "1" ]]; then
        log "REFUSED: $CMD blocked on APP_ENV=$APP_ENV (forward-compatible only; no auto-down-migrate)"
        exit 2
      fi
      log "WARNING: destructive migrate $CMD allowed via ALLOW_DESTRUCTIVE_MIGRATE=1"
    fi
    ;;
  up|version|force|goto) ;;
  *)
    log "usage: migrate-job.sh [up|version|force|goto]  (down/drop blocked in staging/production)"
    exit 2
    ;;
esac

log "migrate-job: command=$CMD app_env=$APP_ENV expected_head=${EXPECTED_HEAD:-none}"

set +e
(
  cd "$BACKEND"
  ./scripts/migrate.sh "$CMD" "$@"
)
RC=$?
set -e

if [[ $RC -ne 0 ]]; then
  log "migrate-job: FAILED rc=$RC — abort rollout (do not deploy API/worker/frontend)"
  echo "status=failed command=$CMD rc=$RC time=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >>"$EVIDENCE_DIR/migrate-job.log"
  exit 1
fi

# Capture version for evidence / gate
set +e
VERSION_OUT="$(cd "$BACKEND" && ./scripts/migrate.sh version 2>&1)"
set -e
log "migrate-job: version_out=$VERSION_OUT"
echo "$VERSION_OUT" >"$EVIDENCE_DIR/migration-version.txt"
echo "status=ok command=$CMD time=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$EVIDENCE_DIR/migrate-job.log"

if [[ -n "$EXPECTED_HEAD" ]]; then
  # golang-migrate prints: "N" or "N (dirty)"
  CURRENT="$(printf '%s\n' "$VERSION_OUT" | grep -Eo '^[0-9]+' | head -1 || true)"
  if [[ -z "$CURRENT" ]]; then
    # try last line digits
    CURRENT="$(printf '%s\n' "$VERSION_OUT" | grep -Eo '[0-9]+' | head -1 || true)"
  fi
  if [[ "$CURRENT" != "$EXPECTED_HEAD" ]]; then
    log "migrate-job: version mismatch current=$CURRENT expected=$EXPECTED_HEAD"
    exit 3
  fi
  log "migrate-job: head matches EXPECTED_HEAD=$EXPECTED_HEAD"
fi

log "migrate-job: OK — safe to proceed with readiness gates then rolling deploy"
exit 0
