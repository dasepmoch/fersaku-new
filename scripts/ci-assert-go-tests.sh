#!/usr/bin/env bash
# QLT-105 — fail if `go test` reported zero tests (no-op suite).
# Usage: scripts/ci-assert-go-tests.sh <label> -- <go test args...>
set -euo pipefail

label="${1:?label required}"
shift
if [[ "${1:-}" == "--" ]]; then shift; fi
if [[ "$#" -eq 0 ]]; then
  echo "ci-assert-go-tests: missing go test args" >&2
  exit 2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

set +e
go test "$@" 2>&1 | tee "$tmp"
ec=${PIPESTATUS[0]}
set -e

if [[ "$ec" -ne 0 ]]; then
  echo "ci-assert-go-tests: $label failed (exit $ec)" >&2
  exit "$ec"
fi

# Require at least one package with executed tests (not only [no tests to run]).
if ! grep -E '^(ok|FAIL)\s+' "$tmp" >/dev/null; then
  echo "ci-assert-go-tests: $label produced no package results" >&2
  exit 1
fi

# Reject pure no-test packages as the only outcome for required suites.
if grep -E '\[no tests to run\]' "$tmp" >/dev/null; then
  if ! grep -E '^ok\s+\S+\s+[0-9]' "$tmp" >/dev/null; then
    echo "ci-assert-go-tests: $label only reported [no tests to run]" >&2
    exit 1
  fi
fi

# Prefer an explicit count when -v or -json not used: "ok ... 0.123s" is enough if package has tests.
# Also reject zero-test via go test -count with empty packages for ./test/contract and ./test/integration.
if ! grep -E '^ok\s+' "$tmp" >/dev/null; then
  echo "ci-assert-go-tests: $label did not pass any package" >&2
  exit 1
fi

echo "ci-assert-go-tests: OK — $label"
