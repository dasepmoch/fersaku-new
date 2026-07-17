#!/usr/bin/env sh
# Verify sqlc-generated code is committed and up to date.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SQLC_BIN="${SQLC_BIN:-}"
if [ -z "$SQLC_BIN" ]; then
  if command -v sqlc >/dev/null 2>&1; then
    SQLC_BIN="$(command -v sqlc)"
  elif [ -x "$HOME/.local/bin/sqlc" ]; then
    SQLC_BIN="$HOME/.local/bin/sqlc"
  else
    echo "check-generated: sqlc not found; install to \$HOME/.local/bin" >&2
    exit 1
  fi
fi

# Ensure queries exist (not empty scaffold).
if [ ! -f internal/adapters/postgres/queries/outbox.sql ]; then
  echo "check-generated: missing outbox.sql queries" >&2
  exit 1
fi

TMPDIR="${TMPDIR:-/tmp}/fersaku-sqlc-check-$$"
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

# Generate into a temp tree and diff against committed gen/.
cp -a internal/adapters/postgres/gen "$TMPDIR/gen-before"
# sqlc writes to out path from sqlc.yaml
"$SQLC_BIN" generate

if ! diff -ru "$TMPDIR/gen-before" internal/adapters/postgres/gen >/dev/null 2>&1; then
  echo "check-generated: sqlc output is dirty — run 'make sqlc' and commit" >&2
  diff -ru "$TMPDIR/gen-before" internal/adapters/postgres/gen || true
  # restore committed tree if we dirtied it
  rm -rf internal/adapters/postgres/gen
  cp -a "$TMPDIR/gen-before" internal/adapters/postgres/gen
  exit 1
fi

echo "check-generated: sqlc gen/ is up to date"
