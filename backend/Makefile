# Fersaku backend Makefile (BE-001..BE-100).
# Go binary: prefer $HOME/.local/go/bin/go if present (go1.24+).

GO ?= $(shell if [ -x "$$HOME/.local/go/bin/go" ]; then echo "$$HOME/.local/go/bin/go"; else command -v go; fi)
export PATH := $(dir $(GO)):$(HOME)/.local/bin:$(PATH)
export GOCACHE ?= $(abspath .)/../.gocache
export GOMODCACHE ?= $(abspath .)/../.gomod
export GOTMPDIR ?= $(abspath .)/../.gotmp

COMPOSE ?= docker compose -f docker-compose.yml
COMPOSE_DEPS := postgres redis minio mailpit minio-init

# Local compose DATABASE_URL for host-side migrate/tests (host port 5433).
DATABASE_URL ?= postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable
export DATABASE_URL

.PHONY: build test tidy vet fmt check-fmt run-api run-worker \
	compose-up compose-down compose-build compose-deps compose-ps compose-logs \
	migrate migrate-down migrate-version seed sqlc check-generated \
	test-integration test-integration-foundation test-contract openapi-lint openapi-bundle \
	resilience-drills resilience-drills-dry resilience-drills-full \
	bootstrap-admin pg-backup-drill health-smoke help

help:
	@echo "Targets:"
	@echo "  build test tidy vet fmt check-fmt run-api run-worker"
	@echo "  compose-up compose-down compose-build compose-deps compose-ps"
	@echo "  migrate migrate-down migrate-version seed bootstrap-admin"
	@echo "  sqlc check-generated test-integration test-integration-foundation test-contract"
	@echo "  openapi-lint openapi-bundle"
	@echo "  resilience-drills resilience-drills-dry resilience-drills-full"
	@echo "  pg-backup-drill health-smoke"
	@echo "GO=$(GO)"
	@echo "DATABASE_URL=$(DATABASE_URL)"
	@echo "QLT-210: make compose-deps && make migrate && make test-integration"

build:
	$(GO) build -o bin/fersaku-api ./cmd/api
	$(GO) build -o bin/fersaku-worker ./cmd/worker

test:
	$(GO) test ./...

# QLT-210 parent: tagged integration required, non-empty, no silent skip when QLT_REQUIRE_INTEGRATION=1.
# Prefer disposable Postgres (compose-deps) + migrate before full suite.
test-integration:
	QLT_REQUIRE_INTEGRATION=1 $(GO) test -tags=integration -count=1 -timeout 20m ./test/integration/...

# Foundation smoke: migrate empty/upgrade + real concurrent idempotency + atomic rollback.
test-integration-foundation:
	QLT_REQUIRE_INTEGRATION=1 $(GO) test -tags=integration -count=1 -timeout 5m \
		-run 'TestMigrate|TestConcurrentIdempotency|TestAtomicCommit|TestPoolPing' \
		./test/integration/

# INT-000: OpenAPI 3.0.3 lint + router/OpenAPI drift gate
test-contract:
	$(GO) test -count=1 ./test/contract/...

openapi-lint:
	@cd .. && npx --yes @redocly/cli@1.34.3 lint backend/api/openapi.yaml --config=redocly.yaml

openapi-bundle:
	@cd .. && npx --yes @redocly/cli@1.34.3 bundle backend/api/openapi.yaml -o backend/api/openapi.bundle.yaml

# BE-620 performance/resilience drills (see docs/performance/resilience-drills.md)
resilience-drills-dry:
	./scripts/resilience_drills.sh --dry-run

resilience-drills:
	./scripts/resilience_drills.sh --local

resilience-drills-full:
	./scripts/resilience_drills.sh --full

tidy:
	$(GO) mod tidy

vet:
	$(GO) vet ./...

fmt:
	gofmt -w $$(find . -name '*.go' -not -path './bin/*' -not -path './internal/adapters/postgres/gen/*')

check-fmt:
	@unformatted=$$(gofmt -l .); \
	if [ -n "$$unformatted" ]; then echo "$$unformatted"; exit 1; fi

run-api:
	APP_ENV=local HTTP_ADDR=:8080 LOG_LEVEL=info XENDIT_MODE=fake $(GO) run ./cmd/api

run-worker:
	APP_ENV=local LOG_LEVEL=info XENDIT_MODE=fake WORKER_RUN_ONCE=true $(GO) run ./cmd/worker

# --- Docker Compose (local only; ADR-0007) ---

compose-build:
	$(COMPOSE) build api worker

compose-deps:
	$(COMPOSE) up -d $(COMPOSE_DEPS)

compose-up:
	$(COMPOSE) up -d --build

compose-down:
	$(COMPOSE) down

compose-ps:
	$(COMPOSE) ps

compose-logs:
	$(COMPOSE) logs -f --tail=100

migrate:
	@sh scripts/migrate.sh up

migrate-down:
	@sh scripts/migrate.sh down 1

migrate-version:
	@sh scripts/migrate.sh version

seed:
	@sh scripts/seed.sh

# KEY-20: one-shot SUPER_ADMIN attach (no persona seed). Production needs BOOTSTRAP_ADMIN_CONFIRM=yes.
bootstrap-admin:
	@test -n "$$BOOTSTRAP_ADMIN_EMAIL" || (echo "BOOTSTRAP_ADMIN_EMAIL required"; exit 1)
	$(GO) run ./cmd/bootstrap-admin

# KEY-11 support: local logical dump/restore drill (not managed PITR).
pg-backup-drill:
	@sh scripts/pg_logical_backup_drill.sh

# Quick dual-provider + health smoke against local compose API.
health-smoke:
	@curl -sf "http://127.0.0.1:18080/health/live" >/dev/null && echo "live:ok" || (echo "live:fail"; exit 1)
	@curl -sf "http://127.0.0.1:18080/health/ready" >/dev/null && echo "ready:ok" || (echo "ready:fail"; exit 1)
	@code=$$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:18080/v1/webhooks/duitku" -H 'Content-Type: application/json' -d '{}'); \
	  test "$$code" = "401" && echo "duitku-webhook:ok ($$code)" || (echo "duitku-webhook:fail ($$code)"; exit 1)
	@code=$$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:18080/v1/webhooks/xendit/disbursement" -H 'Content-Type: application/json' -d '{}'); \
	  test "$$code" = "401" && echo "xendit-disburse-webhook:ok ($$code)" || (echo "xendit-disburse-webhook:fail ($$code)"; exit 1)

sqlc:
	@if command -v sqlc >/dev/null 2>&1; then sqlc generate; \
	elif [ -x "$$HOME/.local/bin/sqlc" ]; then $$HOME/.local/bin/sqlc generate; \
	else echo "sqlc not found"; exit 1; fi

check-generated:
	@sh scripts/check-generated.sh
