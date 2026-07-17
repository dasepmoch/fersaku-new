#!/usr/bin/env bash
# QLT-215 — bring up disposable API stack for Playwright API-mode harness.
# Local/compose only. Never use production credentials or APP_ENV=production.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
COMPOSE=(docker compose -f "$BACKEND/docker-compose.yml")
API_ORIGIN="${API_INTERNAL_URL:-http://127.0.0.1:18080}"
MAILPIT_URL="${MAILPIT_URL:-http://127.0.0.1:8025}"
DATABASE_URL="${DATABASE_URL:-postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable}"
APP_ENV="${APP_ENV:-local}"
SEED_MANIFEST_PATH="${SEED_MANIFEST_PATH:-$ROOT/TASK/evidence/QLT-110/seed-ids.json}"
READY_TIMEOUT_SEC="${E2E_API_READY_TIMEOUT_SEC:-180}"
SKIP_SEED="${E2E_API_SKIP_SEED:-0}"
TEARDOWN="${E2E_API_TEARDOWN:-0}"
WITH_API="${E2E_API_WITH_API:-1}"

export DATABASE_URL APP_ENV SEED_MANIFEST_PATH

if [[ "$APP_ENV" == "production" ]]; then
  echo "e2e-api-stack: refused APP_ENV=production (QLT-215 test-only)" >&2
  exit 2
fi

log() { printf 'e2e-api-stack: %s\n' "$*"; }

wait_http() {
  local url="$1" label="$2" deadline=$((SECONDS + READY_TIMEOUT_SEC)) code
  while (( SECONDS < deadline )); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 "$url" 2>/dev/null || echo 000)"
    if [[ "$code" == "200" ]]; then
      log "$label ready ($url)"
      return 0
    fi
    sleep 2
  done
  echo "e2e-api-stack: timeout waiting for $label ($url last=$code)" >&2
  return 1
}

cleanup() {
  if [[ "$TEARDOWN" == "1" ]]; then
    log "teardown compose (E2E_API_TEARDOWN=1)"
    (cd "$BACKEND" && "${COMPOSE[@]}" down) || true
  fi
}
trap cleanup EXIT

log "deps: postgres redis minio mailpit"
(cd "$BACKEND" && "${COMPOSE[@]}" up -d postgres redis minio mailpit minio-init)

wait_http "http://127.0.0.1:8025/api/v1/info" "mailpit" || \
  wait_http "http://127.0.0.1:8025/" "mailpit-ui"

# Postgres host port is 5433
deadline=$((SECONDS + READY_TIMEOUT_SEC))
until docker exec fersaku-backend-postgres-1 pg_isready -U fersaku -d fersaku >/dev/null 2>&1 \
  || docker exec "$(cd "$BACKEND" && "${COMPOSE[@]}" ps -q postgres)" pg_isready -U fersaku -d fersaku >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "e2e-api-stack: postgres not ready" >&2
    exit 1
  fi
  sleep 1
done
log "postgres ready"

log "migrate"
(cd "$BACKEND" && DATABASE_URL="$DATABASE_URL" make migrate)

if [[ "$SKIP_SEED" != "1" ]]; then
  log "QLT-110 seed"
  (cd "$BACKEND" && DATABASE_URL="$DATABASE_URL" APP_ENV="$APP_ENV" \
    SEED_MANIFEST_PATH="$SEED_MANIFEST_PATH" make seed)
else
  log "skip seed (E2E_API_SKIP_SEED=1)"
fi

if [[ "$WITH_API" == "1" ]]; then
  log "api + worker"
  # Host-side DATABASE_URL (localhost:5433) must not leak into containers.
  # Compose defaults use postgres:5432 / redis:6379 / minio:9000 on the network.
  (
    cd "$BACKEND"
    unset DATABASE_URL REDIS_URL R2_ENDPOINT MAIL_SMTP_HOST || true
    APP_ENV="$APP_ENV" XENDIT_MODE=fake \
      DATABASE_URL="postgres://fersaku:fersaku_local@postgres:5432/fersaku?sslmode=disable" \
      REDIS_URL="redis://redis:6379/0" \
      R2_ENDPOINT="http://minio:9000" \
      MAIL_SMTP_HOST="mailpit" \
      "${COMPOSE[@]}" up -d --build api worker
  )
  wait_http "$API_ORIGIN/health/live" "api-live"
  wait_http "$API_ORIGIN/health/ready" "api-ready"
  wait_http "$API_ORIGIN/v1/public/products/featured?limit=1" "public-featured"
fi

log "stack ready"
log "  API_INTERNAL_URL=$API_ORIGIN"
log "  MAILPIT_URL=$MAILPIT_URL"
log "  DATABASE_URL=(host local compose — nonprod only)"
log "run (Playwright starts Next API-mode webServer):"
log "  npm run test:e2e:api"
log "backend-only probes (no Next webServer):"
log "  E2E_API_SKIP_WEBSERVER=1 E2E_API_HAS_NEXT=0 PLAYWRIGHT_API_BASE_URL=$API_ORIGIN npm run test:e2e:api"

if [[ "${1:-}" == "--keep" ]] || [[ "$TEARDOWN" != "1" ]]; then
  trap - EXIT
fi
