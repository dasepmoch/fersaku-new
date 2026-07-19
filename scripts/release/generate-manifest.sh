#!/usr/bin/env bash
# Generate an immutable release manifest (schema v1).
# Does not publish images; fill digests after docker build/push.
#
# Usage:
#   ./scripts/release/generate-manifest.sh [--out path] [--git-sha SHA]
# Env:
#   RELEASE_ID, CONFIG_SCHEMA_VERSION, IMAGE_REGISTRY, IMAGE_TAG
#   API_DIGEST, WORKER_DIGEST, FRONTEND_DIGEST
#   GO_VERSION, NODE_VERSION, NPM_VERSION
#   BASE_GOLANG, BASE_ALPINE, BASE_NODE
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/release/dist/release-manifest.json"
GIT_SHA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --git-sha) GIT_SHA="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$(dirname "$OUT")"

if [[ -z "$GIT_SHA" ]]; then
  GIT_SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")"
fi
GIT_REF="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
SHORT_SHA="$(printf '%s' "$GIT_SHA" | cut -c1-12)"
RELEASE_ID="${RELEASE_ID:-$SHORT_SHA}"
CREATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
CONFIG_SCHEMA_VERSION="${CONFIG_SCHEMA_VERSION:-1}"

REGISTRY="${IMAGE_REGISTRY:-ghcr.io/fersaku}"
TAG="${IMAGE_TAG:-$SHORT_SHA}"

# Migration head = highest numeric version (golang-migrate integer, no leading zeros)
MIG_HEAD="$(
  find "$ROOT/backend/migrations" -maxdepth 1 -name '*.up.sql' -printf '%f\n' 2>/dev/null \
    | sed -n 's/^\([0-9][0-9]*\)_.*/\1/p' \
    | sort -n \
    | tail -1 \
    | sed 's/^0*//'
)"
# sed above turns 000000 into empty — keep at least 0
MIG_HEAD="${MIG_HEAD:-0}"
if [[ "$MIG_HEAD" == "0" ]] && ! ls "$ROOT/backend/migrations"/*_*.up.sql >/dev/null 2>&1; then
  echo "generate-manifest: no migrations found" >&2
  exit 1
fi

GO_VERSION="${GO_VERSION:-}"
if [[ -z "$GO_VERSION" ]]; then
  if command -v go >/dev/null 2>&1; then
    GO_VERSION="$(go env GOVERSION 2>/dev/null | sed 's/^go//')"
  fi
  if [[ -z "$GO_VERSION" && -f "$ROOT/backend/go.mod" ]]; then
    GO_VERSION="$(awk '/^go /{print $2; exit}' "$ROOT/backend/go.mod")"
  fi
fi
NODE_VERSION="${NODE_VERSION:-}"
if [[ -z "$NODE_VERSION" && -f "$ROOT/frontend/.nvmrc" ]]; then
  NODE_VERSION="$(tr -d '[:space:]' < "$ROOT/frontend/.nvmrc")"
fi
if [[ -z "$NODE_VERSION" ]] && command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -v | sed 's/^v//')"
fi
NPM_VERSION="${NPM_VERSION:-}"
if [[ -z "$NPM_VERSION" ]] && command -v npm >/dev/null 2>&1; then
  NPM_VERSION="$(npm -v 2>/dev/null || true)"
fi

  BASE_GOLANG="${BASE_GOLANG:-golang:1.25-alpine@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587}"
  BASE_ALPINE="${BASE_ALPINE:-alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d}"
  BASE_NODE="${BASE_NODE:-node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd}"

DOMAIN_MAP_FILE="${ROOT}/release/feature-domain-source-map.json"
if [[ ! -f "$DOMAIN_MAP_FILE" ]]; then
  echo "generate-manifest: missing $DOMAIN_MAP_FILE" >&2
  exit 1
fi

API_DIGEST="${API_DIGEST:-}"
WORKER_DIGEST="${WORKER_DIGEST:-}"
FRONTEND_DIGEST="${FRONTEND_DIGEST:-}"

artifact_json() {
  local name="$1" digest="$2"
  local repo="${REGISTRY}/fersaku-${name}"
  if [[ -n "$digest" ]]; then
    printf '{"repository":"%s","tag":"%s","digest":"%s","builtFromGitSha":"%s"}' \
      "$repo" "$TAG" "$digest" "$GIT_SHA"
  else
    printf '{"repository":"%s","tag":"%s","builtFromGitSha":"%s"}' \
      "$repo" "$TAG" "$GIT_SHA"
  fi
}

DOMAIN_MAP_COMPACT="$(tr -d '\n' < "$DOMAIN_MAP_FILE" | sed 's/  */ /g')"

cat >"$OUT" <<EOF
{
  "schemaVersion": "1",
  "releaseId": "${RELEASE_ID}",
  "gitSha": "${GIT_SHA}",
  "gitRef": "${GIT_REF}",
  "createdAt": "${CREATED_AT}",
  "configSchemaVersion": "${CONFIG_SCHEMA_VERSION}",
  "runtimes": {
    "go": "${GO_VERSION:-unknown}",
    "node": "${NODE_VERSION:-unknown}",
    "npm": "${NPM_VERSION:-unknown}"
  },
  "baseImages": {
    "golang": { "ref": "${BASE_GOLANG}" },
    "alpine": { "ref": "${BASE_ALPINE}" },
    "node": { "ref": "${BASE_NODE}" }
  },
  "supplyChain": {
    "packageLockSha256": "",
    "goSumSha256": "",
    "exceptionExpiry": null,
    "policy": "docs/security/supply-chain-policy.md"
  },
  "images": {
    "api": $(artifact_json api "$API_DIGEST"),
    "worker": $(artifact_json worker "$WORKER_DIGEST"),
    "frontend": $(artifact_json frontend "$FRONTEND_DIGEST")
  },
  "migration": {
    "head": "${MIG_HEAD}",
    "tool": "golang-migrate",
    "path": "backend/migrations",
    "forwardCompatibleOnly": true,
    "autoDownMigrate": false
  },
  "featureDomainSourceMap": ${DOMAIN_MAP_COMPACT},
  "provenance": {
    "sbomPaths": [],
    "cosignBundlePaths": [],
    "attestationPaths": []
  },
  "promotion": {
    "strategy": "build-once-digest",
    "rebuildOnPromote": false,
    "stagingDigestVerified": false,
    "productionDigestVerified": false
  },
  "gates": {
    "migrateBeforeRollout": true,
    "readinessRequired": true,
    "callbackSmokeRequired": true,
    "syntheticRequired": true,
    "manualProdApproval": true
  }
}
EOF

# Validate minimal shape with node if available
if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const p = require("path").resolve(process.argv[1]);
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    if (m.schemaVersion !== "1") process.exit(2);
    if (!m.gitSha || !m.images?.api || !m.migration?.head) process.exit(3);
    if (m.migration.autoDownMigrate !== false) process.exit(4);
    if (m.promotion.rebuildOnPromote !== false) process.exit(5);
    console.log("manifest ok releaseId=" + m.releaseId + " mig=" + m.migration.head);
  ' "$OUT"
fi

echo "wrote $OUT"
