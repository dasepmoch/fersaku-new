#!/usr/bin/env bash
# Local/demo logical backup + restore drill (KEY-11 support).
# NOT a substitute for managed PostgreSQL PITR in production.
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-fersaku-backend-postgres-1}"
USER_NAME="${POSTGRES_USER:-fersaku}"
SRC_DB="${POSTGRES_DB:-fersaku}"
CLONE_DB="${POSTGRES_CLONE_DB:-fersaku_restore_drill}"
OUT_DIR="${BACKUP_OUT_DIR:-/tmp/opencode/fersaku-drills}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_NAME="fersaku-${STAMP}.dump"

mkdir -p "$OUT_DIR"

echo "==> dump ${SRC_DB} from ${CONTAINER}"
docker exec "$CONTAINER" pg_dump -U "$USER_NAME" -d "$SRC_DB" -Fc -f /tmp/fersaku.dump
docker cp "${CONTAINER}:/tmp/fersaku.dump" "${OUT_DIR}/${DUMP_NAME}"
ls -la "${OUT_DIR}/${DUMP_NAME}"

echo "==> recreate clone ${CLONE_DB}"
docker exec "$CONTAINER" psql -U "$USER_NAME" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${CLONE_DB};" \
  -c "CREATE DATABASE ${CLONE_DB} OWNER ${USER_NAME};"

echo "==> restore into ${CLONE_DB}"
docker exec "$CONTAINER" pg_restore -U "$USER_NAME" -d "$CLONE_DB" \
  --no-owner --role="$USER_NAME" /tmp/fersaku.dump

echo "==> compare row counts"
docker exec "$CONTAINER" psql -U "$USER_NAME" -d "$SRC_DB" -t -A -c \
  "SELECT 'origin_payments', count(*) FROM payment_intents
   UNION ALL SELECT 'origin_orders', count(*) FROM orders
   UNION ALL SELECT 'origin_withdrawals', count(*) FROM withdrawals;"
docker exec "$CONTAINER" psql -U "$USER_NAME" -d "$CLONE_DB" -t -A -c \
  "SELECT 'clone_payments', count(*) FROM payment_intents
   UNION ALL SELECT 'clone_orders', count(*) FROM orders
   UNION ALL SELECT 'clone_withdrawals', count(*) FROM withdrawals;"

echo "==> OK dump=${OUT_DIR}/${DUMP_NAME} stamp=${STAMP}"
