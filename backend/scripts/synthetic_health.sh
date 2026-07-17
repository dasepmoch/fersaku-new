#!/usr/bin/env bash
# BE-600 synthetic health checks for local compose / staging smoke.
# Exercises: live/ready, metrics, sandbox QRIS path (fake), callback token reject,
# outbox gauge presence, R2/mail readiness signals, audit integrity signal.
#
# Usage:
#   BASE_URL=http://127.0.0.1:18080 ./scripts/synthetic_health.sh
# Exit 0 only if all required checks pass.

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:18080}"
XENDIT_WEBHOOK_TOKEN="${XENDIT_WEBHOOK_TOKEN:-}"
TIMEOUT="${TIMEOUT:-5}"
FAIL=0

log() { printf '%s\n' "$*"; }
pass() { log "PASS: $*"; }
fail() { log "FAIL: $*"; FAIL=1; }

curl_json() {
  # args: method path [extra curl args...]
  local method="$1" path="$2"
  shift 2
  curl -sS -m "$TIMEOUT" -X "$method" \
    -H "Accept: application/json" \
    -H "X-Request-ID: syn_$(date +%s)_$RANDOM" \
    -D /tmp/fersaku_syn_headers.$$ \
    -o /tmp/fersaku_syn_body.$$ \
    -w "%{http_code}" \
    "$@" \
    "${BASE_URL}${path}" || echo "000"
}

code_live=$(curl_json GET /health/live)
if [[ "$code_live" == "200" ]]; then pass "health live"; else fail "health live got $code_live"; fi

code_ready=$(curl_json GET /health/ready)
if [[ "$code_ready" == "200" ]]; then pass "health ready"; else fail "health ready got $code_ready"; fi

# Metrics Prometheus text
code_metrics=$(curl -sS -m "$TIMEOUT" -o /tmp/fersaku_syn_metrics.$$ -w "%{http_code}" \
  -H "X-Request-ID: syn_metrics_$RANDOM" \
  "${BASE_URL}/metrics" || echo "000")
if [[ "$code_metrics" == "200" ]] && grep -q 'fersaku_http_requests_total\|fersaku_outbox_pending\|# TYPE' /tmp/fersaku_syn_metrics.$$; then
  pass "metrics prometheus text"
else
  fail "metrics endpoint (code=$code_metrics)"
fi

# Trace propagation headers
code_trace=$(curl -sS -m "$TIMEOUT" -o /dev/null -D /tmp/fersaku_syn_trace.$$ -w "%{http_code}" \
  -H "X-Request-ID: syn_trace_01" \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  "${BASE_URL}/health/live" || echo "000")
if [[ "$code_trace" == "200" ]] \
  && grep -qi 'X-Request-ID: *syn_trace_01' /tmp/fersaku_syn_trace.$$ \
  && grep -qi 'X-Trace-ID: *4bf92f3577b34da6a3ce929d0e0e4736' /tmp/fersaku_syn_trace.$$; then
  pass "traceparent / request_id propagation"
else
  fail "trace propagation (code=$code_trace)"
fi

# Callback token reject (must not accept without valid token)
code_cb=$(curl -sS -m "$TIMEOUT" -o /tmp/fersaku_syn_cb.$$ -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Callback-Token: definitely-invalid-token-for-synthetic" \
  -H "X-Request-ID: syn_cb_reject_$RANDOM" \
  -d '{"event":"payment.paid","id":"syn-event-1"}' \
  "${BASE_URL}/v1/webhooks/xendit" || echo "000")
if [[ "$code_cb" == "401" || "$code_cb" == "403" ]]; then
  pass "callback invalid token rejected ($code_cb)"
else
  # If webhook route absent in minimal deploy, still fail closed for production-shaped stacks
  fail "callback token reject expected 401/403 got $code_cb"
fi

# Sandbox QRIS path (fake): unauthenticated create should fail auth, not 5xx
# Proves route exists and does not 500 without key.
code_gw=$(curl -sS -m "$TIMEOUT" -o /tmp/fersaku_syn_gw.$$ -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: syn_qris_$RANDOM" \
  -d '{"amount":10000,"currency":"IDR","externalId":"syn-ext-1"}' \
  "${BASE_URL}/v1/gateway/payment-intents" || echo "000")
if [[ "$code_gw" == "401" || "$code_gw" == "403" || "$code_gw" == "400" || "$code_gw" == "422" ]]; then
  pass "sandbox QRIS path responds ($code_gw) without 5xx"
elif [[ "$code_gw" == "404" ]]; then
  # legacy alias
  code_gw2=$(curl -sS -m "$TIMEOUT" -o /tmp/fersaku_syn_gw.$$ -w "%{http_code}" \
    -X POST -H "Content-Type: application/json" \
    -d '{"amount":10000}' "${BASE_URL}/v1/qris/payment-intents" || echo "000")
  if [[ "$code_gw2" != "5"* && "$code_gw2" != "000" ]]; then
    pass "sandbox QRIS legacy path responds ($code_gw2)"
  else
    fail "sandbox QRIS path missing or 5xx ($code_gw/$code_gw2)"
  fi
else
  fail "sandbox QRIS unexpected $code_gw"
fi

# Outbox lag gauges present in metrics
if grep -q 'fersaku_outbox_pending' /tmp/fersaku_syn_metrics.$$ \
  && grep -q 'fersaku_outbox_oldest_age_seconds' /tmp/fersaku_syn_metrics.$$; then
  pass "outbox lag gauges present"
else
  fail "outbox lag gauges missing"
fi

# Audit chain metric family present
if grep -q 'fersaku_audit_chain' /tmp/fersaku_syn_metrics.$$; then
  pass "audit chain metrics present"
else
  fail "audit chain metrics missing"
fi

# R2 / mail: readiness of API implies deps wired; optional status
code_status=$(curl_json GET /v1/status)
if [[ "$code_status" == "200" ]]; then pass "status endpoint"; else fail "status $code_status"; fi

# Mail capture signal: local mailpit HTTP if MAILPIT_URL set
if [[ -n "${MAILPIT_URL:-}" ]]; then
  mp=$(curl -sS -m "$TIMEOUT" -o /dev/null -w "%{http_code}" "${MAILPIT_URL}/api/v1/info" || echo "000")
  if [[ "$mp" == "200" ]]; then pass "mailpit capture ready"; else fail "mailpit $mp"; fi
else
  pass "mail capture skipped (set MAILPIT_URL=http://127.0.0.1:8025 for local)"
fi

# R2/MinIO optional
if [[ -n "${R2_HEALTH_URL:-}" ]]; then
  r2c=$(curl -sS -m "$TIMEOUT" -o /dev/null -w "%{http_code}" "${R2_HEALTH_URL}" || echo "000")
  if [[ "$r2c" == "200" || "$r2c" == "403" ]]; then pass "r2 endpoint reachable ($r2c)"; else fail "r2 $r2c"; fi
else
  pass "r2 ready skipped (set R2_HEALTH_URL for minio/R2 probe)"
fi

rm -f /tmp/fersaku_syn_*.$$ 2>/dev/null || true

if [[ "$FAIL" -ne 0 ]]; then
  log "synthetic_health: FAILED"
  exit 1
fi
log "synthetic_health: OK"
exit 0
