#!/usr/bin/env bash
# Verify release manifest integrity and optional live image digests.
#
# Usage:
#   ./scripts/release/verify-manifest.sh path/to/release-manifest.json
#   REQUIRE_DIGESTS=1 ./scripts/release/verify-manifest.sh ...
#   VERIFY_DOCKER=1 ./scripts/release/verify-manifest.sh ...  # inspect local images
set -euo pipefail

MANIFEST="${1:-}"
if [[ -z "$MANIFEST" || ! -f "$MANIFEST" ]]; then
  echo "usage: verify-manifest.sh <release-manifest.json>" >&2
  exit 2
fi

REQUIRE_DIGESTS="${REQUIRE_DIGESTS:-0}"
VERIFY_DOCKER="${VERIFY_DOCKER:-0}"

node -e '
const fs = require("fs");
const path = require("path");
const manifestPath = path.resolve(process.argv[1]);
const requireDigests = process.argv[2] === "1";
const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const fail = (msg) => { console.error("FAIL:", msg); process.exit(1); };

if (m.schemaVersion !== "1") fail("schemaVersion must be 1");
if (!/^[0-9a-f]{7,40}$/.test(m.gitSha || "")) fail("gitSha invalid");
if (!m.releaseId) fail("releaseId required");
if (!m.migration || !m.migration.head) fail("migration.head required");
if (m.migration.autoDownMigrate !== false) fail("autoDownMigrate must be false");
if (m.migration.forwardCompatibleOnly !== true) fail("forwardCompatibleOnly must be true");
if (!m.promotion || m.promotion.rebuildOnPromote !== false) fail("rebuildOnPromote must be false");
if (m.promotion.strategy !== "build-once-digest") fail("promotion.strategy must be build-once-digest");
if (!m.gates?.migrateBeforeRollout) fail("gates.migrateBeforeRollout required");
if (!m.runtimes?.go || !m.runtimes?.node) fail("runtimes.go/node required");
if (!m.images?.api || !m.images?.worker || !m.images?.frontend) fail("images.api/worker/frontend required");
if (!m.featureDomainSourceMap || typeof m.featureDomainSourceMap !== "object") {
  fail("featureDomainSourceMap required");
}
const digestRe = /^sha256:[0-9a-f]{64}$/;
for (const name of ["api", "worker", "frontend"]) {
  const a = m.images[name];
  if (!a.repository || !a.tag) fail(`images.${name} repository/tag required`);
  if (a.builtFromGitSha && a.builtFromGitSha !== m.gitSha) {
    fail(`images.${name}.builtFromGitSha mismatch gitSha`);
  }
  if (requireDigests) {
    if (!a.digest || !digestRe.test(a.digest)) fail(`images.${name}.digest required`);
  } else if (a.digest && !digestRe.test(a.digest)) {
    fail(`images.${name}.digest invalid`);
  }
}
console.log(JSON.stringify({
  ok: true,
  releaseId: m.releaseId,
  gitSha: m.gitSha,
  migrationHead: m.migration.head,
  digestsPresent: ["api","worker","frontend"].every((n) => !!m.images[n].digest),
}, null, 2));
' "$MANIFEST" "$REQUIRE_DIGESTS"

if [[ "$VERIFY_DOCKER" == "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "VERIFY_DOCKER=1 but docker not found" >&2
    exit 1
  fi
  node -e '
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const m = JSON.parse(fs.readFileSync(path.resolve(process.argv[1]), "utf8"));
for (const name of ["api", "worker", "frontend"]) {
  const a = m.images[name];
  if (!a.digest) continue;
  const ref = a.repository + "@" + a.digest;
  try {
    const out = execSync("docker image inspect --format={{.Id}} " + JSON.stringify(ref), { encoding: "utf8" }).trim();
    console.log("docker ok", name, out);
  } catch {
    const tagRef = a.repository + ":" + a.tag;
    try {
      const id = execSync("docker image inspect --format={{.Id}} " + JSON.stringify(tagRef), { encoding: "utf8" }).trim();
      const dig = execSync("docker image inspect --format={{index .RepoDigests 0}} " + JSON.stringify(tagRef), { encoding: "utf8" }).trim();
      console.log("docker tag present", name, id, dig);
      if (dig && dig.includes("@") && !dig.endsWith("@" + a.digest) && dig.split("@")[1] !== a.digest) {
        console.error("FAIL: local digest mismatch for", name, dig, "expected", a.digest);
        process.exit(1);
      }
    } catch (e) {
      console.error("FAIL: image not found locally", name, ref);
      process.exit(1);
    }
  }
}
' "$MANIFEST"
fi

echo "verify-manifest: OK"
