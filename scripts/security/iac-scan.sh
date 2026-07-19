#!/usr/bin/env bash
# Scan Dockerfiles and compose for common supply-chain / hardening issues.
# Exit 1 on high-confidence production risks (privileged, host network, unpinned mutable prod bases without digest).
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

REPORT_DIR="${IAC_SCAN_REPORT_DIR:-$ROOT/tmp/security-scan}"
mkdir -p "$REPORT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%Y%m%dT%H%M%S)"
REPORT="$REPORT_DIR/iac-scan-$STAMP.txt"
FAIL=0

log() { printf '%s\n' "$*" | tee -a "$REPORT"; }

log "=== iac-scan $STAMP ==="

# --- privileged / host network / docker.sock ---
log "--- privileged / host network / docker.sock ---"
if rg -n --glob '*.yml' --glob '*.yaml' --glob 'Dockerfile*' \
  -e 'privileged:\s*true' \
  -e 'network_mode:\s*["'\'']?host' \
  -e '/var/run/docker\.sock' \
  "$ROOT" 2>/dev/null | rg -v 'node_modules|TASK/|tmp/' || true; then
  HITS=$(rg -n --glob '*.yml' --glob '*.yaml' --glob 'Dockerfile*' \
    -e 'privileged:\s*true' \
    -e 'network_mode:\s*["'\'']?host' \
    -e '/var/run/docker\.sock' \
    "$ROOT" 2>/dev/null | rg -v 'node_modules|TASK/|tmp/' || true)
  if [ -n "${HITS:-}" ]; then
    log "FAIL privileged/host/docker.sock:"
    log "$HITS"
    FAIL=1
  else
    log "PASS no privileged/host/docker.sock"
  fi
else
  log "PASS no privileged/host/docker.sock"
fi

# --- unpinned base images in Dockerfiles (must have @sha256:) ---
log "--- Dockerfile FROM pins ---"
UNPINNED=""
while IFS= read -r line; do
  # FROM name:tag without digest
  if printf '%s' "$line" | rg -q '^FROM[[:space:]]' && ! printf '%s' "$line" | rg -q '@sha256:'; then
    # allow scratch
    if printf '%s' "$line" | rg -q 'FROM[[:space:]]+scratch([[:space:]]|$)'; then
      continue
    fi
    # allow stage refs: FROM runtime-base AS api
    if printf '%s' "$line" | rg -q '^FROM[[:space:]]+[a-zA-Z0-9._-]+[[:space:]]+AS[[:space:]]' \
      && ! printf '%s' "$line" | rg -q '[:/]'; then
      continue
    fi
    # stage-only names without registry/tag
    if printf '%s' "$line" | rg -q '^FROM[[:space:]]+(builder|deps|runtime-base|api|worker|runner)([[:space:]]|$)'; then
      continue
    fi
    UNPINNED="${UNPINNED}${line}"$'\n'
  fi
done < <(rg -n '^FROM ' "$ROOT/backend/Dockerfile" "$ROOT/frontend/Dockerfile" 2>/dev/null || true)

if [ -n "$UNPINNED" ]; then
  log "FAIL unpinned FROM (require tag@sha256:):"
  log "$UNPINNED"
  FAIL=1
else
  log "PASS Dockerfiles pin digests"
fi

# --- compose third-party images without digest ---
# Allow: local build tags (fersaku-*:local), env-substituted ${VAR}, digest pins.
log "--- compose image pins ---"
COMPOSE_HITS=$(rg -n '^\s*image:\s*' \
  "$ROOT/backend/docker-compose.yml" \
  "$ROOT/backend/docker-compose.release.yml" \
  "$ROOT/backend/docker-compose.staging.yml" \
  2>/dev/null \
  | rg -v '@sha256:' \
  | rg -v '\$\{' \
  | rg -v 'fersaku-[a-z]+:local' \
  | rg -v 'image:\s*$' \
  || true)
if [ -n "${COMPOSE_HITS:-}" ]; then
  log "FAIL compose third-party images without @sha256: digest:"
  log "$COMPOSE_HITS"
  FAIL=1
else
  log "PASS compose third-party images pin digests (local build tags / env refs allowed)"
fi

# --- secret-like ENV baked defaults (high confidence only) ---
log "--- secret-like ENV in Dockerfiles ---"
SEC=$(rg -n -i 'ENV.*(SECRET|PASSWORD|API_KEY|PRIVATE_KEY|TOKEN)\s*=' \
  "$ROOT/backend/Dockerfile" "$ROOT/frontend/Dockerfile" 2>/dev/null || true)
if [ -n "${SEC:-}" ]; then
  log "FAIL secret-like ENV in Dockerfile:"
  log "$SEC"
  FAIL=1
else
  log "PASS no secret ENV in Dockerfiles"
fi

# --- USER root without later nonroot (informational on multi-stage) ---
log "--- final USER nonroot check ---"
for df in backend/Dockerfile frontend/Dockerfile; do
  if ! rg -q 'USER nonroot' "$ROOT/$df"; then
    log "FAIL $df missing USER nonroot"
    FAIL=1
  else
    log "PASS $df has USER nonroot"
  fi
done

# --- debug endpoints note (compose local ports are expected) ---
log "--- exposed debug ports (informational) ---"
rg -n 'ports:' -A2 "$ROOT/backend/docker-compose.yml" >>"$REPORT" 2>/dev/null || true
log "NOTE: local compose binds 18080/5433/6380/9000/8025 — production must not publish these on public LB (ADR-0007)."

if [ "$FAIL" -eq 0 ]; then
  log "=== iac-scan RESULT: PASS ==="
  log "report=$REPORT"
  exit 0
fi
log "=== iac-scan RESULT: FAIL ==="
log "report=$REPORT"
exit 1
