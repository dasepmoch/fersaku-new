#!/usr/bin/env bash
# Generate SBOM (Syft) and CVE scan (Grype, fallback Trivy) for local images.
# Usage:
#   ./scripts/security/image-scan.sh fersaku-api:ci fersaku-worker:ci fersaku-frontend:ci
# Env:
#   FAIL_ON=critical|high  (default critical)
#   OUT_DIR=release/dist/sbom
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/release/dist/sbom}"
FAIL_ON="${FAIL_ON:-critical}"
mkdir -p "$OUT_DIR"

if [ "$#" -lt 1 ]; then
  echo "usage: image-scan.sh <image:tag> [image:tag...]" >&2
  exit 2
fi

install_syft() {
  if command -v syft >/dev/null 2>&1; then return 0; fi
  echo "installing syft..."
  curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b "$ROOT/tmp/bin"
  export PATH="$ROOT/tmp/bin:$PATH"
}

install_grype() {
  if command -v grype >/dev/null 2>&1; then return 0; fi
  echo "installing grype..."
  curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b "$ROOT/tmp/bin"
  export PATH="$ROOT/tmp/bin:$PATH"
}

mkdir -p "$ROOT/tmp/bin"
export PATH="$ROOT/tmp/bin:$PATH"

install_syft
install_grype

FAIL=0
for img in "$@"; do
  safe="$(printf '%s' "$img" | tr '/:' '__')"
  echo "=== SBOM $img ==="
  syft "$img" -o spdx-json >"$OUT_DIR/${safe}.spdx.json"
  test -s "$OUT_DIR/${safe}.spdx.json"
  sha256sum "$OUT_DIR/${safe}.spdx.json" | tee "$OUT_DIR/${safe}.spdx.sha256"

  echo "=== Grype $img (fail-on $FAIL_ON) ==="
  set +e
  grype "$img" -o json >"$OUT_DIR/${safe}.grype.json"
  grype "$img" --fail-on "$FAIL_ON"
  GC=$?
  set -e
  if [ "$GC" -ne 0 ]; then
    echo "FAIL grype $img exit=$GC" >&2
    FAIL=1
  else
    echo "PASS grype $img"
  fi
done

# Evidence summary
{
  echo "image-scan $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for img in "$@"; do
    safe="$(printf '%s' "$img" | tr '/:' '__')"
    echo "image=$img"
    echo "  sbom=$OUT_DIR/${safe}.spdx.json"
    echo "  grype=$OUT_DIR/${safe}.grype.json"
    if command -v docker >/dev/null 2>&1; then
      docker image inspect --format='  id={{.Id}}' "$img" 2>/dev/null || true
    fi
  done
} | tee "$OUT_DIR/scan-summary.txt"

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
echo "image-scan: PASS"
