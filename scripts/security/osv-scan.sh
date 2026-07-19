#!/usr/bin/env bash
# Optional OSV/SCA scan for frontend lockfile + Go module.
# Skips cleanly if osv-scanner is not installed (exit 0 with SKIP).
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
REPORT_DIR="${OSV_REPORT_DIR:-$ROOT/tmp/security-scan}"
mkdir -p "$REPORT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%Y%m%dT%H%M%S)"

if ! command -v osv-scanner >/dev/null 2>&1; then
  echo "SKIP osv-scanner not installed (optional: go install github.com/google/osv-scanner/cmd/osv-scanner@latest)"
  exit 0
fi

FAIL=0
set +e
osv-scanner --lockfile="$ROOT/frontend/package-lock.json" \
  --output=json >"$REPORT_DIR/osv-npm-$STAMP.json" 2>"$REPORT_DIR/osv-npm-$STAMP.err"
N=$?
osv-scanner --lockfile="$ROOT/backend/go.mod" \
  --output=json >"$REPORT_DIR/osv-go-$STAMP.json" 2>"$REPORT_DIR/osv-go-$STAMP.err"
G=$?
set -e

# osv-scanner: 0=clean, 1=vulns found
if [ "$N" -gt 1 ] || [ "$G" -gt 1 ]; then
  echo "FAIL osv-scanner tool error npm=$N go=$G" >&2
  exit 1
fi
if [ "$N" -eq 1 ] || [ "$G" -eq 1 ]; then
  echo "osv-scanner found vulnerabilities (see $REPORT_DIR/osv-*-$STAMP.json)"
  # Do not hard-fail here if npm-audit-gate already owns npm; surface as report.
  # Fail only when FAIL_ON_OSV=1
  if [ "${FAIL_ON_OSV:-0}" = "1" ]; then
    exit 1
  fi
  echo "WARN: set FAIL_ON_OSV=1 to fail the job"
  exit 0
fi
echo "osv-scan: PASS"
