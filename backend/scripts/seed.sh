#!/usr/bin/env sh
# QLT-110 single deterministic nonprod seed owner.
# Refuses APP_ENV=production (enforced in cmd/seed).
# System roles/permissions still come from migration 000004_rbac.
# Optional: BOOTSTRAP_ADMIN_EMAIL attaches SUPER_ADMIN to an existing user after seed.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
  export DATABASE_URL
fi

if [ -z "${APP_ENV:-}" ]; then
  APP_ENV=local
  export APP_ENV
fi

if [ "$APP_ENV" = "production" ]; then
  echo "seed: refused APP_ENV=production (QLT-110)" >&2
  exit 2
fi

GO_BIN="${GO_BIN:-}"
if [ -z "$GO_BIN" ]; then
  if [ -x "$HOME/.local/go/bin/go" ]; then
    GO_BIN="$HOME/.local/go/bin/go"
  elif command -v go >/dev/null 2>&1; then
    GO_BIN="$(command -v go)"
  else
    echo "seed: go binary not found" >&2
    exit 1
  fi
fi

echo "seed: QLT-110 deterministic nonprod seed (APP_ENV=$APP_ENV)"
export DATABASE_URL
export APP_ENV
if [ -n "${SEED_MANIFEST_PATH:-}" ]; then
  export SEED_MANIFEST_PATH
fi
if [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ]; then
  export BOOTSTRAP_ADMIN_EMAIL
  echo "seed: will also attach SUPER_ADMIN to BOOTSTRAP_ADMIN_EMAIL after persona seed"
fi

"$GO_BIN" run ./cmd/seed
echo "seed: done"
