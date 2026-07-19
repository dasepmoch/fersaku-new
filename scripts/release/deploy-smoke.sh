#!/usr/bin/env bash
# Deployment smoke against a *running published* stack (image/process), not source tree alone.
# Proves callback routes do not 404 and health surfaces respond.
#
# Usage:
#   API_BASE_URL=http://127.0.0.1:18080 ./scripts/release/deploy-smoke.sh
#   MANIFEST=release/dist/release-manifest.json API_BASE_URL=... ./scripts/release/deploy-smoke.sh
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
API_BASE_URL="${API_BASE_URL:-${BASE_URL:-http://127.0.0.1:18080}}"
FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-}"
MANIFEST="${MANIFEST:-}"
TIMEOUT="${TIMEOUT:-5}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT}/release/dist/evidence}"
mkdir -p "$EVIDENCE_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="${EVIDENCE_DIR}/deploy-smoke-${STAMP}.txt"
FAIL=0

log() { printf '%s\n' "$*" | tee -a "$REPORT"; }
pass() { log "PASS: $*"; }
fail() { log "FAIL: $*"; FAIL=1; }

log "deploy-smoke start time=$(date -u +%Y-%m-%dT%H:%M:%SZ) api=$API_BASE_URL"

if [[ -n "$MANIFEST" && -f "$MANIFEST" ]]; then
  log "manifest=$MANIFEST"
  "$ROOT/scripts/release/verify-manifest.sh" "$MANIFEST" | tee -a "$REPORT" || fail "manifest verify"
  # Record digests for evidence
  node -e '
    const fs=require("fs");
    const p=require("path").resolve(process.argv[1]);
    const m=JSON.parse(fs.readFileSync(p,"utf8"));
    console.log("releaseId="+m.releaseId);
    console.log("gitSha="+m.gitSha);
    for (const n of ["api","worker","frontend"]) {
      const a=m.images[n];
      console.log("image."+n+"="+(a.digest||a.tag)+" repo="+a.repository);
    }
    console.log("migration.head="+m.migration.head);
  ' "$MANIFEST" | tee -a "$REPORT"
fi

code() {
  curl -sS -m "$TIMEOUT" -o /tmp/fersaku_smoke.$$ -w "%{http_code}" "$@" || echo "000"
}

c=$(code "${API_BASE_URL}/health/live")
[[ "$c" == "200" ]] && pass "live" || fail "live=$c"

c=$(code "${API_BASE_URL}/health/ready")
[[ "$c" == "200" ]] && pass "ready" || fail "ready=$c"

# Callback routes: must not 404 on actually-published image
ROUTES=(
  "/v1/webhooks/duitku"
  "/v1/webhooks/duitku/sandbox"
  "/v1/webhooks/duitku/live"
  "/v1/webhooks/xendit"
  "/v1/webhooks/xendit/sandbox"
  "/v1/webhooks/xendit/live"
  "/v1/webhooks/xendit/disbursement"
)
for path in "${ROUTES[@]}"; do
  c=$(curl -sS -m "$TIMEOUT" -o /tmp/fersaku_smoke_cb.$$ -w "%{http_code}" \
    -X POST -H "Content-Type: application/json" -d '{}' \
    "${API_BASE_URL}${path}" || echo "000")
  if [[ "$c" == "404" ]]; then
    fail "callback $path → 404 (route not on published image)"
  elif [[ "$c" == "000" ]]; then
    fail "callback $path unreachable"
  else
    pass "callback $path → $c (mounted)"
  fi
done

if [[ -n "$FRONTEND_BASE_URL" ]]; then
  c=$(code "${FRONTEND_BASE_URL}/api/health")
  [[ "$c" == "200" ]] && pass "frontend health" || fail "frontend health=$c"
fi

if [[ $FAIL -ne 0 ]]; then
  log "deploy-smoke: FAILED"
  exit 1
fi
log "deploy-smoke: OK report=$REPORT"
exit 0
