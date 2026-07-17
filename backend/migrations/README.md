# Database migrations

## Ownership

| Role | Purpose |
| ---- | ------- |
| **migrate** (CI/ops / `make migrate`) | Owns DDL: `CREATE`/`ALTER`/`DROP`, extension install, grants. Runs `golang-migrate` against `DATABASE_URL`. |
| **app** (`fersaku-api` / `fersaku-worker`) | Runtime DML/`SELECT` only. Must **not** create tables, alter schema, or own migration history in production. |

Local compose currently uses a single `fersaku` superuser for convenience. Staging/production must separate migrate credentials from the app role (ADR-0001, ADR-0007).

## Tooling

```bash
# From backend/, with compose postgres up:
export DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
make migrate          # scripts/migrate.sh → golang-migrate up
make migrate-down     # one step down
make migrate-version  # print version
```

Migrations live in this directory as `NNNNNN_name.up.sql` / `.down.sql`.  
Version table: `schema_migrations` (golang-migrate default).

## ID and money conventions (BE-100)

- Public/resource IDs: **text ULID** (26-char Crockford), same as `ports.IDGenerator`.
- Timestamps: `timestamptz` UTC.
- Money (later domain tables): `bigint` whole IDR units — never float.

## QLT-110 deterministic nonprod seed

Single seed owner: `make seed` → `scripts/seed.sh` → `cmd/seed` → `internal/seed`.

- Refuses `APP_ENV=production` (exit 2).
- Fixed clock `2026-01-15T12:00:00Z`; stable `01HQ0SEED…` IDs.
- Required personas + commerce/finance/KYC/callback scenarios for isolation tests.
- Optional `SEED_MANIFEST_PATH` writes JSON ID map (see `TASK/evidence/QLT-110/`).
- Optional `BOOTSTRAP_ADMIN_EMAIL` still attaches `SUPER_ADMIN` to an **existing** user after persona seed (does not create a second seed command).

```bash
export DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
export APP_ENV=local
make migrate
make seed
```

Migration `000004_rbac` still seeds immutable system roles/permissions.

### Authorization policy (FORBIDDEN vs NOT_FOUND)

| Case | Response |
| ---- | -------- |
| Authenticated but missing permission on a known action/list | `403 FORBIDDEN` |
| Cross-tenant resource ID (store/merchant/buyer resource) | `404 RESOURCE_NOT_FOUND` (prefer no existence leak) |
| Unscoped admin list without grant | `403 FORBIDDEN` |

## BE-300 fee policy immutability

Migration `000014_fee_policy` seeds checksum-verified `LAUNCH_FEE_POLICY_V1`
(`300 bps + Rp700`, withdrawal `300 bps`, min withdrawal `Rp50.000`).

| Role | `fee_policies` | `fee_snapshots` |
| ---- | -------------- | --------------- |
| **migrate** | INSERT seed only (no runtime UPDATE) | DDL |
| **app** | `SELECT` only | `SELECT` + `INSERT` (append-only at payment/withdrawal create) |
| **admin API** | read + pure preview calculator | none |

There is **no** admin fee publish/mutate endpoint. Future policy versions require
approved product ADR, new version id, effective time, checksum-verified migration,
regression tests, and controlled release (ADR-0003).
