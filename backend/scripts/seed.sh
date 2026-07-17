#!/usr/bin/env sh
# Deterministic seed for BE-130 RBAC bootstrap.
# System roles/permissions are seeded by migration 000004_rbac.
# Optional: BOOTSTRAP_ADMIN_EMAIL attaches SUPER_ADMIN to an existing user.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
  export DATABASE_URL
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

echo "seed: system roles/permissions come from migration 000004_rbac"
if [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ]; then
  echo "seed: attaching SUPER_ADMIN to BOOTSTRAP_ADMIN_EMAIL (user must exist)"
  export DATABASE_URL
  export BOOTSTRAP_ADMIN_EMAIL
  "$GO_BIN" run ./cmd/seed
else
  echo "seed: BOOTSTRAP_ADMIN_EMAIL unset — skip SUPER_ADMIN attach"
  echo "seed: set BOOTSTRAP_ADMIN_EMAIL=admin@example.com after registering that user"
fi

echo "seed: done"
