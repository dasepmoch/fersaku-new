# Fersaku backend

Go modular monolith (`fersaku-api` + `fersaku-worker`) for hosted storefront commerce and QRIS payment gateway. PostgreSQL is authoritative; Redis is non-authoritative; Cloudflare R2 private-by-default; single Xendit account.

Module: `github.com/dasepmoch/fersaku-new/backend`

## Status

- **BE-000 done:** product/architecture ADRs under [`docs/adr/`](docs/adr/) (index: [`docs/DECISIONS.md`](docs/DECISIONS.md)).
- **BE-001 done:** Go workspace scaffold (layout, config, ports, fake adapters, API/worker binaries, import-boundary tests).
- **BE-002 done:** Docker multi-target images, local Compose, config fail-closed rules, Makefile compose targets, backend CI workflow.
- **BE-100 done:** pgx pool, golang-migrate, outbox/idempotency/audit-stub tables, sqlc, unit-of-work, cursor package, integration tests.
- **BE-110 done:** chi router, envelope/problem presenters, strict JSON decoder, middleware stack (recovery → request ID → trusted proxy → logging → timeout → auth placeholder → CSRF stub → rate limit), `/v1/status`, OpenAPI components.
- **BE-120 done:** identity/session lifecycle (cookie sessions, Argon2id, MFA, CSRF).
- **BE-125 done:** profile, password change, dual email-change, MFA disable, notification preferences.
- **BE-130 done:** RBAC permission registry, system roles seed, user_roles, merchant/store membership, RequirePermission middleware, bootstrap admin via `BOOTSTRAP_ADMIN_EMAIL`.
- **Next:** **BE-135** — custom roles CRUD, invitations, anti-escalation assignment APIs.

## Prerequisites

- Go **1.24+**. If system Go is older, use the local install:
  ```bash
  export PATH="$HOME/.local/go/bin:$PATH"
  go version   # expect go1.24.x
  ```
- Docker (user in `docker` group; no sudo).
- Makefile auto-detects `$HOME/.local/go/bin/go` when present.

## Layout (ADR-0001 / §2.3)

```text
backend/
  cmd/api/main.go          # fersaku-api
  cmd/worker/main.go       # fersaku-worker
  internal/app/            # composition root (wires adapters)
  internal/application/    # use cases
  internal/domain/…        # pure domain packages
  internal/ports/          # Clock, IDGenerator, Logger, Queue, Mailer
  internal/adapters/       # http, postgres, redis, xendit, r2, queue, mail, observability
  internal/jobs/           # worker scheduler hooks
  internal/security/       # crypto helpers (later)
  migrations/              # SQL migrations (golang-migrate; migrate role owns DDL)
  api/openapi.yaml         # OpenAPI stub
  sqlc.yaml                # sqlc → internal/adapters/postgres/gen
  Dockerfile               # multi-target: api | worker
  docker-compose.yml       # local only (not production topology)
  scripts/                 # migrate.sh, seed.sh, check-generated.sh
  test/{fixtures,contract,integration}
```

**Dependency direction:** `cmd` → `internal/app` → `application` → `domain` / `ports` ← `adapters`.  
Domain must not import chi, pgx, redis, xendit, R2, or HTTP handlers (enforced by `internal/architecture` tests).

**ID choice:** public IDs use **ULID** (Crockford base32, 26 chars, time-sortable) via `ports.IDGenerator`. Stored as Postgres `text`.

## Docker images

Single multi-stage `Dockerfile` with targets (no separate `Dockerfile.worker`):

| Target | Binary | Notes |
| ------ | ------ | ----- |
| `api` | `/app/fersaku-api` | non-root UID 65532; exposes 8080 in-container |
| `worker` | `/app/fersaku-worker` | non-root; no public ports |

```bash
cd backend
docker build --target api -t fersaku-api:local .
docker build --target worker -t fersaku-worker:local .
```

No secrets are baked into images. Config comes from env / Compose.

## Local Docker Compose

Compose is **local/dev only** (ADR-0007). Production uses a managed container runtime.

```bash
cd backend
cp -n .env.example .env   # optional local overrides

make compose-deps         # postgres redis minio mailpit (+ bucket init)
make compose-up           # build + start api/worker + deps
make compose-ps
make compose-down

make migrate              # golang-migrate up (requires migrate binary + DATABASE_URL)
make sqlc                 # regenerate sqlc under internal/adapters/postgres/gen
make seed                 # stub until domain seeds land
make test-integration     # go test -tags=integration (requires postgres)
```

Or:

```bash
docker compose -f docker-compose.yml up -d postgres redis minio mailpit
docker compose -f docker-compose.yml up --build api worker
```

### Host ports

| Service | Host port | Container | Notes |
| ------- | --------- | --------- | ----- |
| API | **18080** | 8080 | avoids busy host 8080 |
| Postgres | **5433** | 5432 | user/db `fersaku`, password `fersaku_local` |
| Redis | **6380** | 6379 | |
| MinIO S3 API | **9000** | 9000 | root `minioadmin` / `minioadmin` (local only) |
| MinIO console | **9001** | 9001 | |
| Mailpit SMTP | **1025** | 1025 | no real mail provider |
| Mailpit UI | **8025** | 8025 | |

```bash
curl -s http://localhost:18080/health/live
curl -s http://localhost:18080/health/ready
# Mailpit UI: http://localhost:8025
# MinIO console: http://localhost:9001
```

Local Xendit = **fake adapter** (`XENDIT_MODE=fake`). Compose contains **no production credentials**.

MinIO buckets created by `minio-init`: `fersaku-public`, `fersaku-private` (private anonymous = none). Path-style S3 semantics match the R2 adapter contract.

## Build / run / test (host Go)

```bash
cd backend
export PATH="$HOME/.local/go/bin:$PATH"

make tidy          # go mod tidy
make vet           # go vet ./...
make test          # go test ./...
make build         # bin/fersaku-api + bin/fersaku-worker
make check-fmt     # gofmt -l must be empty
make check-generated

# API (default :8080 on host process)
make run-api
# curl -s localhost:8080/health/live

# Worker (fake queue; WORKER_RUN_ONCE=true exits after ready)
make run-worker
```

### Config (env)

| Variable | Default (local) | Notes |
| -------- | --------------- | ----- |
| `APP_ENV` | `local` | `local\|staging\|production\|test` |
| `HTTP_ADDR` | `:8080` | API listen address |
| `LOG_LEVEL` | `info` | `debug\|info\|warn\|error` |
| `SHUTDOWN_TIMEOUT_SEC` | `15` | graceful shutdown bound |
| `WORKER_RUN_ONCE` | `false` | worker exits after ready (tests) |
| `DATABASE_URL` | optional local | required + no `sslmode=disable` in production |
| `REDIS_URL` | optional local | required `rediss://` in production |
| `XENDIT_MODE` | `fake` | `fake` forbidden in production |
| `XENDIT_SECRET_KEY` | empty | required in production |
| `XENDIT_WEBHOOK_TOKEN` | empty | required in production |
| `SESSION_SECRET` | empty ok local | required ≥32 chars in production; no local placeholders |
| `CSRF_SECRET` | empty ok local | required ≥32 chars in production |
| `KYC_ENCRYPTION_KEY` | empty ok local | required in production |
| `R2_*` | MinIO local | production forbids `http://` / minio / localhost endpoints |
| `MAIL_*` | Mailpit local | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | optional |

See [`.env.example`](.env.example) for the full key list. Invalid config fails fast at process start. No secrets are baked into binaries.

**Fail-closed production rules (§3.4):** fake Xendit, missing session/CSRF/KYC keys, non-TLS Redis, `sslmode=disable` Postgres, or local MinIO endpoints are rejected when `APP_ENV=production`.

When `DATABASE_URL` is set, the composition root opens a real **pgx pool** (timeouts, max conns, health Ping). Without it, unit tests and local boot use a **noop** DB pinger (no Postgres required).

### Database / migrations (BE-100)

| Item | Detail |
| ---- | ------ |
| Host URL (compose) | `postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable` |
| Tool | [golang-migrate](https://github.com/golang-migrate/migrate) (`migrate` binary in `$PATH` or `$HOME/.local/bin`) |
| Path | `migrations/*.up.sql` / `*.down.sql` |
| Version table | `schema_migrations` (migrate-owned) |
| Foundation tables | `outbox_events`, `idempotency_records`, `audit_events` (minimal stub), `schema_meta` |
| ID strategy | `text` ULID (documented in `schema_meta.id_strategy`) |
| Money | `bigint` whole IDR when present later |
| sqlc | `make sqlc` → `internal/adapters/postgres/gen` |
| UoW | `postgres.Pool.RunAtomic` commits domain + idempotency + outbox (+ audit stub) or rolls back |
| Cursor | `internal/platform/cursor` — opaque `(created_at, id)` encode/decode |

**Role separation:** migrations are run by the **migrate** identity (`make migrate` / CI). The app role must not create tables in production (see `migrations/README.md`). Local compose may share the `fersaku` user for convenience.

```bash
# Tools (no sudo)
curl -sSL https://github.com/golang-migrate/migrate/releases/download/v4.18.3/migrate.linux-amd64.tar.gz \
  | tar -xz -C "$HOME/.local/bin" migrate
curl -sSL https://github.com/sqlc-dev/sqlc/releases/download/v1.29.0/sqlc_1.29.0_linux_amd64.tar.gz \
  | tar -xz -C "$HOME/.local/bin" sqlc

cd backend
make compose-deps
export DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
make migrate
make test                    # unit — no DB required
make test-integration        # requires DATABASE_URL + migrated DB
# or:
go test -tags=integration ./test/integration/...
```

## CI

Workflow: [`.github/workflows/backend-ci.yml`](../.github/workflows/backend-ci.yml)

- `go fmt` check, `go vet`, `go test ./...`
- separate `go test -race` job
- `docker build --target api` and `worker`
- `scripts/check-generated.sh` verifies sqlc gen/ is up to date

Frontend CI remains in `.github/workflows/ci.yml` (unchanged).

## Docs

| Doc | Role |
| --- | ---- |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | ADR index |
| [`../docs/BACKEND_PRODUCTION_TASKS.md`](../docs/BACKEND_PRODUCTION_TASKS.md) | Authoritative task backlog |
| [`../docs/BACKEND_HANDOFF.md`](../docs/BACKEND_HANDOFF.md) | Frontend → backend contracts |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Frontend boundaries |

Frontend remains mock-first by default (`NEXT_PUBLIC_DATA_SOURCE=mock`). Do not change UI/design for backend work.
