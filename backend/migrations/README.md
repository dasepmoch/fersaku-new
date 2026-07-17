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

## BE-130 RBAC bootstrap

Migration `000004_rbac` seeds immutable system roles (`SUPER_ADMIN`, `ADMIN_SUPPORT`,
`ADMIN_FINANCE`, `SELLER_OWNER`, `BUYER`) and the stable permission registry.

To attach `SUPER_ADMIN` to an existing user after register/verify:

```bash
export DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
export BOOTSTRAP_ADMIN_EMAIL='admin@example.com'
make seed
```

`BOOTSTRAP_ADMIN_EMAIL` does **not** create users; seed fails if the email is unknown.

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
