#!/usr/bin/env sh
# BE-610 security scan: go vet, govulncheck (optional), secret patterns, deps list, docker image note.
# Exit 0 when no critical/high findings; non-zero on high-confidence secret hits or vet failure.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GO="${GO:-}"
if [ -z "$GO" ]; then
  if [ -x "$HOME/.local/go/bin/go" ]; then
    GO="$HOME/.local/go/bin/go"
  else
    GO="$(command -v go)"
  fi
fi
export PATH="$(dirname "$GO"):${PATH:-}"
export GOCACHE="${GOCACHE:-$ROOT/../.gocache}"
export GOMODCACHE="${GOMODCACHE:-$ROOT/../.gomod}"
export GOTMPDIR="${GOTMPDIR:-$ROOT/../.gotmp}"
# Prefer go.mod toolchain directive (go1.25.12+); allow auto-download.
export GOTOOLCHAIN="${GOTOOLCHAIN:-auto}"
mkdir -p "$GOCACHE" "$GOMODCACHE" "$GOTMPDIR" 2>/dev/null || true

REPORT_DIR="${SECURITY_SCAN_REPORT_DIR:-$ROOT/tmp/security-scan}"
mkdir -p "$REPORT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%Y%m%dT%H%M%S)"
REPORT="$REPORT_DIR/scan-$STAMP.txt"
FAIL=0

log() {
  printf '%s\n' "$*" | tee -a "$REPORT"
}

log "=== Fersaku BE-610 security_scan ==="
log "time_utc=$STAMP"
log "root=$ROOT"
log "go=$GO ($($GO version 2>/dev/null || echo unknown))"
log "go_toolchain=$($GO env GOVERSION 2>/dev/null || true)"
log ""

# --- 1. go vet (SAST baseline) ---
log "--- [1/5] go vet ./... ---"
if $GO vet ./... >>"$REPORT" 2>&1; then
  log "PASS go vet"
else
  log "FAIL go vet"
  FAIL=1
fi
log ""

# --- 2. govulncheck (dependency / stdlib vulns) ---
log "--- [2/5] govulncheck ./... ---"
GOVULN="$(command -v govulncheck 2>/dev/null || true)"
if [ -z "$GOVULN" ] && [ -x "$HOME/go/bin/govulncheck" ]; then
  GOVULN="$HOME/go/bin/govulncheck"
fi
if [ -n "$GOVULN" ]; then
  # Capture output; fail on known vulnerable packages (govulncheck exit 3 = vulns found).
  set +e
  "$GOVULN" ./... >>"$REPORT" 2>&1
  GV=$?
  set -e
  if [ "$GV" -eq 0 ]; then
    log "PASS govulncheck (no known vulns)"
  else
    log "FAIL govulncheck exit=$GV (treat as high until residual accepted)"
    FAIL=1
  fi
else
  log "SKIP govulncheck not installed (install: go install golang.org/x/vuln/cmd/govulncheck@latest)"
fi
log ""

# --- 3. Secret scan ---
log "--- [3/5] secret scan ---"
SECRET_HITS=0
if command -v gitleaks >/dev/null 2>&1; then
  set +e
  gitleaks detect --source "$ROOT" --no-git -v >>"$REPORT" 2>&1
  GL=$?
  set -e
  if [ "$GL" -eq 0 ]; then
    log "PASS gitleaks"
  else
    log "FAIL gitleaks exit=$GL"
    SECRET_HITS=1
    FAIL=1
  fi
else
  log "gitleaks not found; using ripgrep high-confidence patterns (exclude tests, .env.example, docs examples)"
  # High-confidence only: private keys, AWS keys, known live secret prefixes in non-test paths.
  # Do not scan: *_test.go, .env.example, gen/, docs with placeholders, scripts with pattern strings.
  set +e
  RG_OUT=$(rg -n --glob '!**/*_test.go' --glob '!**/gen/**' --glob '!**/.env.example' \
    --glob '!**/docs/**' --glob '!**/scripts/security_scan.sh' --glob '!**/tmp/**' \
    -e 'BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY' \
    -e 'AKIA[0-9A-Z]{16}' \
    -e 'xendit[_-]?secret[_-]?key\s*[:=]\s*["'\'']xnd_' \
    -e '(api[_-]?key|secret[_-]?key|password)\s*[:=]\s*["'\''][A-Za-z0-9_\-]{32,}["'\'']' \
    "$ROOT" 2>/dev/null)
  set -e
  if [ -n "${RG_OUT:-}" ]; then
    log "POTENTIAL SECRET HITS:"
    log "$RG_OUT"
    # Filter known safe placeholders / test fixtures that may live outside *_test.go
    FILTERED=$(printf '%s\n' "$RG_OUT" | rg -v 'not-for-prod|placeholder|example\.com|CHANGE_ME|your-|test-session-secret|test-kyc-encryption|prod-csrf-secret-32|fersaku_local' || true)
    if [ -n "$FILTERED" ]; then
      log "FAIL secret pattern (after placeholder filter)"
      log "$FILTERED"
      SECRET_HITS=1
      FAIL=1
    else
      log "PASS secret patterns (only known placeholders)"
    fi
  else
    log "PASS secret patterns (no matches)"
  fi
fi
log "secret_hits=$SECRET_HITS"
log ""

# --- 4. Dependency list ---
log "--- [4/5] go list -m all (module inventory) ---"
$GO list -m all >"$REPORT_DIR/go-modules-$STAMP.txt" 2>>"$REPORT" || true
log "wrote $REPORT_DIR/go-modules-$STAMP.txt"
$GO list -m -json all >"$REPORT_DIR/go-modules-$STAMP.json" 2>/dev/null || true
log "module_count=$($GO list -m all 2>/dev/null | wc -l | tr -d ' ')"
log ""

# --- 5. Docker image note ---
log "--- [5/5] docker image note ---"
log "Dockerfile: multi-target api/worker, non-root UID 65532, no secrets in image."
log "Base: golang:1.25-alpine builder; alpine:3.21 runtime (see Dockerfile)."
log "Remediation SLA: docs/security/scan-sla.md"
log "Optional: trivy image --severity CRITICAL,HIGH fersaku-api:<tag>"
if command -v docker >/dev/null 2>&1; then
  log "docker=$(docker --version 2>/dev/null || true)"
else
  log "docker CLI not available in this environment"
fi
log ""

if [ "$FAIL" -eq 0 ]; then
  log "=== RESULT: PASS (exit 0) ==="
  log "report=$REPORT"
  exit 0
fi

log "=== RESULT: FAIL (exit 1) — see report; accept via docs/security/residual-risks.md if residual ==="
log "report=$REPORT"
exit 1
