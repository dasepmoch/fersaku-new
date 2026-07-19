#!/usr/bin/env bash
# Canary / promote / rollback using immutable digests from a release manifest.
# Schema: forward-compatible only; never auto-down-migrate.
#
# This script is the executable deployment contract for local/staging rehearsal.
# Managed LB weight / production platform apply is OWNER/BLOCKED without CD platform.
#
# Usage:
#   # Record current digests as "previous" before canary
#   ./scripts/release/canary-rollback.sh snapshot --manifest release/dist/release-manifest.json
#
#   # Canary: run one slice with NEW digests (compose rehearsal)
#   ./scripts/release/canary-rollback.sh canary --manifest release/dist/release-manifest.json
#
#   # Promote: all replicas to manifest digests
#   ./scripts/release/canary-rollback.sh promote --manifest release/dist/release-manifest.json
#
#   # Rollback: previous snapshot digests (no migrate down)
#   ./scripts/release/canary-rollback.sh rollback --previous release/dist/previous-manifest.json
#
# Env:
#   COMPOSE_PROJECT / COMPOSE_FILES for local rehearsal
#   APPLY=1 to actually docker compose up (default dry-run)
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
ACTION="${1:-}"
shift $(( $# > 0 ? 1 : 0 )) 2>/dev/null || true

MANIFEST=""
PREVIOUS="${ROOT}/release/dist/previous-manifest.json"
APPLY="${APPLY:-0}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT}/release/dist/evidence}"
mkdir -p "$EVIDENCE_DIR" "$(dirname "$PREVIOUS")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest) MANIFEST="$2"; shift 2 ;;
    --previous) PREVIOUS="$2"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    *) echo "unknown: $1" >&2; exit 2 ;;
  esac
done

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

require_manifest() {
  if [[ -z "$MANIFEST" || ! -f "$MANIFEST" ]]; then
    log "ERROR: --manifest path required"
    exit 2
  fi
  REQUIRE_DIGESTS=1 "$ROOT/scripts/release/verify-manifest.sh" "$MANIFEST"
}

digest_for() {
  local name="$1" file="$2"
  node -e 'const fs=require("fs");const p=require("path").resolve(process.argv[1]);const m=JSON.parse(fs.readFileSync(p,"utf8"));const a=m.images[process.argv[2]];if(!a||!a.digest)process.exit(2);console.log(a.repository+"@"+a.digest);' \
    "$file" "$name"
}

tag_for() {
  local name="$1" file="$2"
  node -e 'const fs=require("fs");const p=require("path").resolve(process.argv[1]);const m=JSON.parse(fs.readFileSync(p,"utf8"));const a=m.images[process.argv[2]];console.log(a.repository+":"+a.tag);' \
    "$file" "$name"
}

write_evidence() {
  local action="$1" file="$2"
  local out="${EVIDENCE_DIR}/canary-rollback-${action}-$(date -u +%Y%m%dT%H%M%SZ).txt"
  {
    echo "action=$action"
    echo "time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "manifest=$file"
    echo "auto_down_migrate=false"
    echo "money_state=preserved (code/image only; no schema down)"
    node -e '
      const fs=require("fs");
      const p=require("path").resolve(process.argv[1]);
      const m=JSON.parse(fs.readFileSync(p,"utf8"));
      console.log("releaseId="+m.releaseId);
      console.log("gitSha="+m.gitSha);
      console.log("migration.head="+m.migration.head);
      for (const n of ["api","worker","frontend"]) {
        console.log(n+".digest="+(m.images[n].digest||"missing"));
      }
    ' "$file"
  } >"$out"
  log "evidence=$out"
}

compose_rehearse() {
  local file="$1" mode="$2"
  local api_ref worker_ref fe_ref
  api_ref="$(tag_for api "$file")"
  worker_ref="$(tag_for worker "$file")"
  fe_ref="$(tag_for frontend "$file")"
  # Prefer digest pull when available
  if node -e 'const fs=require("fs");const p=require("path").resolve(process.argv[1]);const m=JSON.parse(fs.readFileSync(p,"utf8"));process.exit(m.images.api.digest?0:1)' "$file"; then
    api_ref="$(digest_for api "$file" 2>/dev/null || tag_for api "$file")"
    worker_ref="$(digest_for worker "$file" 2>/dev/null || tag_for worker "$file")"
    fe_ref="$(digest_for frontend "$file" 2>/dev/null || tag_for frontend "$file")"
  fi

  log "mode=$mode api=$api_ref worker=$worker_ref frontend=$fe_ref"
  log "policy: no migrate down; outbox/payment state retained on rollback"

  if [[ "$APPLY" != "1" ]]; then
    log "dry-run (set APPLY=1 to execute compose). Would set:"
    log "  FERSAKU_API_IMAGE=$api_ref"
    log "  FERSAKU_WORKER_IMAGE=$worker_ref"
    log "  FERSAKU_FRONTEND_IMAGE=$fe_ref"
    if [[ "$mode" == "canary" ]]; then
      log "  canary slice: scale api canary=1 keep majority previous"
    fi
    return 0
  fi

  # Compose rehearsal path (local/staging only — not production managed topology)
  export FERSAKU_API_IMAGE="$api_ref"
  export FERSAKU_WORKER_IMAGE="$worker_ref"
  export FERSAKU_FRONTEND_IMAGE="$fe_ref"
  local files=(-f "$ROOT/backend/docker-compose.yml")
  if [[ -f "$ROOT/backend/docker-compose.release.yml" ]]; then
    files+=(-f "$ROOT/backend/docker-compose.release.yml")
  fi
  case "$mode" in
    canary)
      # One API slice on new image; workers optional
      (cd "$ROOT/backend" && docker compose "${files[@]}" up -d --no-deps --force-recreate api)
      ;;
    promote|rollback)
      (cd "$ROOT/backend" && docker compose "${files[@]}" up -d --no-deps --force-recreate api worker)
      if docker compose "${files[@]}" config --services 2>/dev/null | grep -q '^frontend$'; then
        (cd "$ROOT/backend" && docker compose "${files[@]}" up -d --no-deps --force-recreate frontend)
      fi
      ;;
  esac
}

case "$ACTION" in
  snapshot)
    require_manifest
    cp -f "$MANIFEST" "$PREVIOUS"
    log "snapshot previous → $PREVIOUS"
    write_evidence snapshot "$MANIFEST"
    ;;
  canary)
    require_manifest
    if [[ ! -f "$PREVIOUS" ]]; then
      log "WARN: no previous snapshot; create with snapshot first for safe rollback"
    fi
    log "canary: deploy one slice of new digests; majority stays previous"
    log "schema: forward-compatible; migration already applied by migrate-job"
    compose_rehearse "$MANIFEST" canary
    write_evidence canary "$MANIFEST"
    ;;
  promote)
    require_manifest
    log "promote: full roll to manifest digests (build-once; no rebuild)"
    compose_rehearse "$MANIFEST" promote
    write_evidence promote "$MANIFEST"
    ;;
  rollback)
    if [[ ! -f "$PREVIOUS" ]]; then
      log "ERROR: --previous file missing ($PREVIOUS)"
      exit 2
    fi
    MANIFEST="$PREVIOUS"
    require_manifest
    log "rollback: previous immutable digests only — NO migrate down"
    log "outbox/payment/ledger rows are NOT undone"
    compose_rehearse "$PREVIOUS" rollback
    write_evidence rollback "$PREVIOUS"
    ;;
  *)
    cat <<'EOF' >&2
usage:
  canary-rollback.sh snapshot --manifest <file>
  canary-rollback.sh canary   --manifest <file> [--apply]
  canary-rollback.sh promote  --manifest <file> [--apply]
  canary-rollback.sh rollback [--previous <file>] [--apply]
EOF
    exit 2
    ;;
esac

log "canary-rollback: $ACTION done"
