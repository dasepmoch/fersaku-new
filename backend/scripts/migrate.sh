#!/usr/bin/env sh
# Run SQL migrations with golang-migrate (migrate identity, not app identity).
# See migrations/README.md for role separation.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
MIGRATIONS_PATH="${MIGRATIONS_PATH:-$ROOT/migrations}"

if [ -z "${DATABASE_URL:-}" ]; then
  # Local compose host default (BE-002 ports).
  DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
  export DATABASE_URL
fi

MIGRATE_BIN="${MIGRATE_BIN:-}"
if [ -z "$MIGRATE_BIN" ]; then
  if command -v migrate >/dev/null 2>&1; then
    MIGRATE_BIN="$(command -v migrate)"
  elif [ -x "$HOME/.local/bin/migrate" ]; then
    MIGRATE_BIN="$HOME/.local/bin/migrate"
  else
    echo "migrate: golang-migrate binary not found. Install to \$HOME/.local/bin:" >&2
    echo "  curl -sSL https://github.com/golang-migrate/migrate/releases/download/v4.18.3/migrate.linux-amd64.tar.gz | tar -xz -C \"\$HOME/.local/bin\" migrate" >&2
    exit 1
  fi
fi

CMD="${1:-up}"
shift "$(( $# > 0 ? 1 : 0 ))" 2>/dev/null || true

echo "migrate: path=$MIGRATIONS_PATH command=$CMD"
case "$CMD" in
  up)
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" up "$@"
    ;;
  down)
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" down "${1:-1}"
    ;;
  drop)
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" drop -f
    ;;
  version)
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" version
    ;;
  force)
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" force "$@"
    ;;
  goto)
    "$MIGRATE_BIN" -path "$MIGRATIONS_PATH" -database "$DATABASE_URL" goto "$@"
    ;;
  *)
    echo "usage: migrate.sh [up|down|drop|version|force|goto] [args...]" >&2
    exit 2
    ;;
esac

echo "migrate: done"
