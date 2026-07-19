#!/usr/bin/env bash
# Verify release provenance: digests required; signatures required when REQUIRE_SIGNATURE=1.
#
# Usage:
#   ./scripts/security/verify-provenance.sh release/dist/release-manifest.json
# Env:
#   REQUIRE_DIGESTS=1          (default 1)
#   REQUIRE_SIGNATURE=1        fail if no cosign/attestation refs (default 0 for local)
#   REQUIRE_SBOM=1             fail if sbomPaths empty (default 1)
#   COSIGN_VERIFY=1            run cosign verify against registry refs when present
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
MANIFEST="${1:-}"
if [[ -z "$MANIFEST" || ! -f "$MANIFEST" ]]; then
  echo "usage: verify-provenance.sh <release-manifest.json>" >&2
  exit 2
fi

REQUIRE_DIGESTS="${REQUIRE_DIGESTS:-1}"
REQUIRE_SIGNATURE="${REQUIRE_SIGNATURE:-0}"
REQUIRE_SBOM="${REQUIRE_SBOM:-1}"
COSIGN_VERIFY="${COSIGN_VERIFY:-0}"

# Base manifest integrity
REQUIRE_DIGESTS="$REQUIRE_DIGESTS" "$ROOT/scripts/release/verify-manifest.sh" "$MANIFEST"

node -e '
const fs = require("fs");
const path = require("path");
const m = JSON.parse(fs.readFileSync(path.resolve(process.argv[1]), "utf8"));
const requireSig = process.argv[2] === "1";
const requireSbom = process.argv[3] === "1";
const fail = (msg) => { console.error("FAIL:", msg); process.exit(1); };

const prov = m.provenance || {};
const sboms = prov.sbomPaths || [];
const cosign = prov.cosignBundlePaths || [];
const attest = prov.attestationPaths || [];
const signed = prov.signed === true || cosign.length > 0 || attest.length > 0 || !!prov.cosignIdentity;

if (requireSbom && sboms.length < 1) {
  fail("provenance.sbomPaths required (SBOM attached to release)");
}
if (requireSig && !signed) {
  fail("unsigned artifact: set provenance.signed or cosignBundlePaths/attestationPaths (REQUIRE_SIGNATURE=1)");
}

// Lock evidence optional fields
const evidence = m.supplyChain || {};
console.log(JSON.stringify({
  ok: true,
  releaseId: m.releaseId,
  sbomCount: sboms.length,
  signed,
  packageLockSha256: evidence.packageLockSha256 || null,
  goSumSha256: evidence.goSumSha256 || null,
  exceptionExpiry: evidence.exceptionExpiry || null,
}, null, 2));
' "$MANIFEST" "$REQUIRE_SIGNATURE" "$REQUIRE_SBOM"

if [[ "$COSIGN_VERIFY" == "1" ]]; then
  if ! command -v cosign >/dev/null 2>&1; then
    echo "COSIGN_VERIFY=1 but cosign not installed" >&2
    exit 1
  fi
  node -e '
const fs = require("fs");
const { execSync } = require("child_process");
const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const name of ["api", "worker", "frontend"]) {
  const a = m.images[name];
  if (!a?.digest) continue;
  const ref = a.repository + "@" + a.digest;
  try {
    execSync("cosign verify --output text " + JSON.stringify(ref), { stdio: "inherit" });
    console.log("cosign ok", name);
  } catch {
    console.error("FAIL: cosign verify rejected", ref);
    process.exit(1);
  }
}
' "$MANIFEST"
fi

echo "verify-provenance: OK"
