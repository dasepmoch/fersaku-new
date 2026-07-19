#!/usr/bin/env bash
# Dedicated migration job for rollout (never run from API/worker boot).
# Forward-only on staging/production. Delegates guards to backend/scripts/migrate.sh.
#
# Usage:
#   DATABASE_URL=... ./scripts/release/migrate-job.sh up
#   DATABASE_URL=... ./scripts/release/migrate-job.sh version
#   EXPECTED_HEAD=35 DATABASE_URL=... ./scripts/release/migrate-job.sh up
#
# Pre-flight (production):
#   MIGRATE_REQUIRE_BACKUP_CHECKPOINT=1 requires MIGRATE_BACKUP_CHECKPOINT set
#   (PITR/backup id recorded by operator — not invented by this script).
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
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT}/release/dist/evidence}"
mkdir -p "$EVIDENCE_DIR"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

export APP_ENV
export MIGRATE_ACTOR="${MIGRATE_ACTOR:-${GITHUB_ACTOR:-${USER:-migrate-job}}}"
export MIGRATE_JOB_ID="${MIGRATE_JOB_ID:-${GITHUB_RUN_ID:-local-$(date +%s)}}"
export MIGRATE_AUDIT_LOG="${MIGRATE_AUDIT_LOG:-$EVIDENCE_DIR/migrate-audit.log}"
export MIGRATE_LOCK_TIMEOUT_MS="${MIGRATE_LOCK_TIMEOUT_MS:-5000}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "ERROR: DATABASE_URL required for migrate job (no local fallback in release path)"
  exit 2
fi

# Production: refuse local compose URL (also enforced in migrate.sh).
if [[ "$APP_ENV" == "production" ]]; then
  case "$DATABASE_URL" in
    *fersaku_local*|*localhost:5433*|*@localhost*|*@127.0.0.1*)
      log "REFUSED: local/compose DATABASE_URL on APP_ENV=production"
      exit 2
      ;;
  esac
  if [[ "${MIGRATE_REQUIRE_BACKUP_CHECKPOINT:-0}" == "1" ]]; then
    if [[ -z "${MIGRATE_BACKUP_CHECKPOINT:-}" ]]; then
      log "REFUSED: MIGRATE_REQUIRE_BACKUP_CHECKPOINT=1 but MIGRATE_BACKUP_CHECKPOINT empty (record PITR/backup id first)"
      exit 2
    fi
    log "backup_checkpoint=${MIGRATE_BACKUP_CHECKPOINT}"
    echo "backup_checkpoint=${MIGRATE_BACKUP_CHECKPOINT} time=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      >>"$EVIDENCE_DIR/migrate-job.log"
  fi
fi

case "$CMD" in
  up|version|down|drop|force|goto) ;;
  *)
    log "usage: migrate-job.sh [up|version|down|drop|force|goto]  (destructive blocked on staging/production without break-glass)"
    exit 2
    ;;
esac

log "migrate-job: command=$CMD app_env=$APP_ENV expected_head=${EXPECTED_HEAD:-none} job=$MIGRATE_JOB_ID"

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
  exit "$RC"
fi

# Capture version for evidence / gate
set +e
VERSION_OUT="$(cd "$BACKEND" && ./scripts/migrate.sh version 2>&1)"
set -e
log "migrate-job: version_out=$VERSION_OUT"
# Strip audit lines from version capture for clean head parse
CLEAN_VERSION="$(printf '%s\n' "$VERSION_OUT" | grep -v 'migrate_audit' | grep -v 'migrate:' | tail -1 || true)"
echo "$CLEAN_VERSION" >"$EVIDENCE_DIR/migration-version.txt"
echo "status=ok command=$CMD time=$(date -u +%Y-%m-%dT%H:%M:%SZ) version=$CLEAN_VERSION" \
  >>"$EVIDENCE_DIR/migrate-job.log"

if [[ -n "$EXPECTED_HEAD" ]]; then
  CURRENT="$(printf '%s\n' "$VERSION_OUT" | grep -Eo '[0-9]+' | head -1 || true)"
  if [[ "$CURRENT" != "$EXPECTED_HEAD" ]]; then
    log "migrate-job: version mismatch current=$CURRENT expected=$EXPECTED_HEAD — do not deploy new app image"
    exit 3
  fi
  log "migrate-job: head matches EXPECTED_HEAD=$EXPECTED_HEAD"
fi

log "migrate-job: OK — safe to proceed with readiness gates then rolling deploy"
exit 0
