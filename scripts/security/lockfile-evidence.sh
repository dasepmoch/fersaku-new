#!/usr/bin/env bash
# Emit lockfile hashes + exception expiry for release evidence.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
OUT="${1:-}"

pkg_lock="$ROOT/frontend/package-lock.json"
go_sum="$ROOT/backend/go.sum"
exc="$ROOT/docs/security/npm-advisory-exceptions.json"

hash_file() {
  if [[ -f "$1" ]]; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "missing"
  fi
}

PKG_SHA="$(hash_file "$pkg_lock")"
GO_SHA="$(hash_file "$go_sum")"
EXC_EXP=""
if [[ -f "$exc" ]] && command -v node >/dev/null 2>&1; then
  EXC_EXP="$(node -e '
    const e=require(process.argv[1]);
    const dates=(e.exceptions||[]).map(x=>x.expiresAt).filter(Boolean).sort();
    console.log(dates[0]||"");
  ' "$exc")"
fi

JSON=$(printf '{"packageLockSha256":"%s","goSumSha256":"%s","exceptionExpiry":%s,"generatedAt":"%s"}' \
  "$PKG_SHA" "$GO_SHA" \
  "$(if [[ -n "$EXC_EXP" ]]; then printf '"%s"' "$EXC_EXP"; else echo null; fi)" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)")

if [[ -n "$OUT" ]]; then
  mkdir -p "$(dirname "$OUT")"
  printf '%s\n' "$JSON" >"$OUT"
  echo "wrote $OUT"
else
  printf '%s\n' "$JSON"
fi
