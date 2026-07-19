#!/usr/bin/env bash
# Post-migrate / pre-promote gates. Fail closed if required deps are not ready.
#
# Usage:
#   API_BASE_URL=http://127.0.0.1:18080 ./scripts/release/deploy-gate.sh
#   FRONTEND_BASE_URL=http://127.0.0.1:3000 ./scripts/release/deploy-gate.sh
#
# Checks (required unless SKIP_*=1):
#   - API live + ready
#   - callback ingress mounted (not 404) for duitku + xendit
#   - metrics scrapeable
#   - optional frontend /api/health
#   - optional synthetic_health.sh
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
API_BASE_URL="${API_BASE_URL:-${BASE_URL:-http://127.0.0.1:18080}}"
FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-}"
TIMEOUT="${TIMEOUT:-5}"
FAIL=0
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT}/release/dist/evidence}"
mkdir -p "$EVIDENCE_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="${EVIDENCE_DIR}/deploy-gate-${STAMP}.txt"

log() { printf '%s\n' "$*" | tee -a "$REPORT"; }
pass() { log "PASS: $*"; }
fail() { log "FAIL: $*"; FAIL=1; }

http_code() {
  local url="$1"
  shift
  curl -sS -m "$TIMEOUT" -o /tmp/fersaku_gate_body.$$ -w "%{http_code}" "$@" "$url" || echo "000"
}

log "deploy-gate start api=$API_BASE_URL frontend=${FRONTEND_BASE_URL:-none} time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- API live ---
c=$(http_code "${API_BASE_URL}/health/live")
if [[ "$c" == "200" ]]; then pass "api /health/live"; else fail "api /health/live got $c"; fi

# --- API ready (deps: db/redis/storage/mail/queue as configured) ---
c=$(http_code "${API_BASE_URL}/health/ready")
if [[ "$c" == "200" ]]; then
  pass "api /health/ready"
else
  fail "api /health/ready got $c (required dependency not ready — stop rollout)"
fi

# --- metrics ---
c=$(http_code "${API_BASE_URL}/metrics")
if [[ "$c" == "200" ]]; then pass "api /metrics"; else fail "api /metrics got $c"; fi

# --- callback ingress mounted (must not 404 on published image) ---
# Empty/invalid auth should yield 401/403, never 404.
check_callback() {
  local path="$1"
  local code
  code=$(curl -sS -m "$TIMEOUT" -o /tmp/fersaku_gate_cb.$$ -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: gate_cb_$RANDOM" \
    -d '{}' \
    "${API_BASE_URL}${path}" || echo "000")
  if [[ "$code" == "404" || "$code" == "000" ]]; then
    fail "callback $path missing (got $code) — published image must mount route"
  elif [[ "$code" == "401" || "$code" == "403" || "$code" == "400" || "$code" == "422" ]]; then
    pass "callback $path mounted (got $code)"
  else
    # 200/202 with empty body is unexpected but proves mount
    pass "callback $path reachable (got $code)"
  fi
}

if [[ "${SKIP_CALLBACK_SMOKE:-0}" != "1" ]]; then
  check_callback "/v1/webhooks/duitku"
  check_callback "/v1/webhooks/xendit"
  check_callback "/v1/webhooks/xendit/disbursement"
fi

# --- frontend health ---
if [[ -n "$FRONTEND_BASE_URL" && "${SKIP_FRONTEND:-0}" != "1" ]]; then
  c=$(http_code "${FRONTEND_BASE_URL}/api/health")
  if [[ "$c" == "200" ]]; then pass "frontend /api/health"; else fail "frontend /api/health got $c"; fi
fi

# --- synthetic (optional full path) ---
if [[ "${RUN_SYNTHETIC:-1}" == "1" && -x "$ROOT/backend/scripts/synthetic_health.sh" ]]; then
  if BASE_URL="$API_BASE_URL" "$ROOT/backend/scripts/synthetic_health.sh" >>"$REPORT" 2>&1; then
    pass "synthetic_health"
  else
    fail "synthetic_health"
  fi
fi

if [[ $FAIL -ne 0 ]]; then
  log "deploy-gate: FAILED — do not promote"
  exit 1
fi
log "deploy-gate: OK"
exit 0
