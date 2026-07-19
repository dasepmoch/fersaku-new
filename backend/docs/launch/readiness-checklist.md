# BE-630 Launch readiness checklist

**Task:** BE-630 Staging-to-production launch 
**Prepared:** 2026-07-17 
**Authority:** `docs/BACKEND_PRODUCTION_TASKS.md` §15 BE-630, §16, ADR-0007 
**Evidence root:** `backend/tmp/launch-evidence/`

This checklist is executable. Each row must have real proof (script output, test name, or owner-sign residual). Do **not** mark production live until **Owner-sign** rows are signed.

---

## 0. Owner-sign gate (residual — owner may be asleep)

| Item | Status | Sign |
| ---- | ------ | ---- |
| Launch evidence package complete (this tree + evidence) | **READY for owner sign** | Product / Eng / Security: ________ / date ________ |
| BE-610 residual risks (`docs/security/residual-risks.md`) | **Accepted pending signatures** (RR-001 pentest) | Security: ________ |
| Live **Duitku** payment dashboard: callback URL + keys match secret manager | **OWNER** | Payments: ________ |
| Live **Xendit** disbursement dashboard: webhook URL + token match secret manager | **OWNER** | Payments: ________ |
| Production secrets loaded in secret manager (not compose files) | **OWNER** | Eng: ________ |
| Managed HA Postgres + PITR + Redis TLS + R2 buckets provisioned | **OWNER** | Ops: ________ |
| DNS / TLS / ingress CIDRs for `fersaku.net` + API host | **OWNER** | Ops: ________ |
| Controlled live canary with real money path (post-owner) | **OWNER after canary** | Eng: ________ |

---

## 1. Migrations

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 1.1 | Migration files present through audit chain | `ls migrations/*.up.sql` | `000001`…`000028_audit_chain` |
| 1.2 | Migrate identity separate from app | `migrations/README.md` | Documented |
| 1.3 | Local DB at head | `./scripts/migrate.sh version` | Evidence: `01-migrate-version.txt` |
| 1.4 | Bootstrap runs migrate up | `./scripts/launch_bootstrap.sh` | Evidence: `02-launch-bootstrap.txt` |
| 1.5 | Production: single migrate job under advisory lock before rollout | `docs/launch/topology.md` §Migration | Policy documented; **OWNER** runs on prod |

---

## 2. Secrets

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 2.1 | Required env matrix (no real secrets in repo) | `docs/launch/secrets-matrix.md` | File present |
| 2.2 | Production fail-closed config | `internal/config/config.go` `validateByEnv` | Unit tests `config_test.go` |
| 2.3 | `.env.example` placeholders only | Review | No production keys committed |
| 2.4 | Secret manager populated for staging/prod | Ops checklist | **OWNER** |

---

## 3. Callbacks (dual-provider: Duitku payment + Xendit disbursement)

> **ADR-0008 / PROD:** Payment ingress = **Duitku** (`POST /v1/webhooks/duitku`). Disbursement = **Xendit** (`POST /v1/webhooks/xendit` + disbursement webhook). Do not treat Xendit as primary QRIS for launch.

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 3.1 | Xendit invalid/missing callback token rejected; no side effects | Integration callback tests + `synthetic_health.sh` | Integration suite; evidence synthetic |
| 3.2 | Duitku empty/invalid signature rejected (401), route mounted (not 404) | `POST /v1/webhooks/duitku` empty body → 401 | PROD-B20; host + E2E-00 |
| 3.3 | Duitku signed `resultCode=00` → PAID + single settlement (sandbox) | B50 + E2E-06 | `TASK/PROD/evidence/PROD-B50/`; E2E-06 evidence |
| 3.4 | Replay callback idempotent (no double settlement) | B50 / E2E-06 replay | Same |
| 3.5 | Inbound provider callbacks ≠ outbound seller webhooks | Admin routes + runbook | `docs/runbooks/callback-failure.md` |
| 3.6 | Failure-domain notes (Xendit historical + Duitku) | `docs/launch/xendit-callback-failure-domain.md` + PROD-E20 matrix | Files + PROD-E20 |
| 3.7 | Live Duitku callback URL on dashboard → HA API ingress | Dashboard | **OWNER** (KEY-40 / KEY-62) |
| 3.8 | Live Xendit disbursement webhook URL + token | Dashboard | **OWNER** (KEY-41 / KEY-62) |

---

## 4. Alerts / observability

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 4.1 | Prometheus `/metrics` | Synthetic + live curl | Evidence synthetic |
| 4.2 | Launch SLOs | `docs/slo.md` | Present (BE-600) |
| 4.3 | Dashboards | `docs/dashboards/launch-overview.md` | Present |
| 4.4 | Runbooks (12 minimum from §17) | `docs/runbooks/*` | BE-600 set; extend as needed |
| 4.5 | Alert routes wired to on-call | Ops | **OWNER** |

---

## 5. Seed / admin bootstrap

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 5.1 | System roles/permissions from migration `000004_rbac` | migrate up | Migrations |
| 5.2 | QLT-110 persona seed | `cmd/seed` | **Nonprod only** — refuses `APP_ENV=production` (exit 2) |
| 5.3 | Production SUPER_ADMIN attach | `cmd/bootstrap-admin` | Documented below (KEY-20) |
| 5.4 | First production admin registered + bootstrapped | Ops | **OWNER** after register/verify |

### Production admin bootstrap (no persona seed)

> **Do not** run `./scripts/seed.sh` / `cmd/seed` when `APP_ENV=production`. Seed is QLT-110 demo personas only.

1. Deploy migrations to head (`./scripts/migrate.sh up` as migrate identity). System roles come from migrations, not seed.
2. Register the real operator via `POST /v1/auth/register` (seller surface is fine for first user); verify email.
3. One-shot assign SUPER_ADMIN to that **existing** email:

```bash
export DATABASE_URL='postgres://…'   # app/migrate role as documented
export BOOTSTRAP_ADMIN_EMAIL='ops@yourdomain.com'
# required when APP_ENV=production:
export BOOTSTRAP_ADMIN_CONFIRM=yes
go run ./cmd/bootstrap-admin
# or: built binary bootstrap-admin
```

4. Confirm: login → admin permissions present.
5. **Unset** `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_CONFIRM` from long-lived env. Do not leave them standing.

### Nonprod demo seed (optional)

Local/staging only: `./scripts/seed.sh` or `make seed` applies QLT-110 personas + optional `BOOTSTRAP_ADMIN_EMAIL` attach after personas. Still refuse production.

---

## 6. HA topology / ingress / budgets

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 6.1 | Approved HA topology | `docs/launch/topology.md` | ADR-0007 aligned |
| 6.2 | Pool budget ≤ 80% DB max | `docs/performance/pool-tuning.md` + topology | Linked |
| 6.3 | Drain / autoscaling policy | topology.md | Documented |
| 6.4 | Staging compose map (local unbroken) | `docker-compose.staging.yml` comments + topology | Optional overlay |

---

## 7. E2E acceptance + FE contract

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 7.1 | Global acceptance matrix mapped | `docs/launch/e2e-acceptance.md` | All §16 rows |
| 7.2 | `go test ./...` | Launch evidence | `10-go-unit.txt` |
| 7.3 | Integration | Launch evidence | `11-go-integration.txt` |
| 7.4 | Synthetic / security / resilience | Scripts | `03`/`04`/`05` evidence |
| 7.5 | FE vitest (no UI redesign) | `npm run test:run` if feasible | `20-fe-vitest.txt` or skip note |

---

## 8. Canary + rollback

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 8.1 | Procedure | `docs/launch/canary-rollback.md` | Present |
| 8.2 | Local canary-equivalent | compose recreate + health/metrics/synthetic | `30-canary-local.txt` |
| 8.3 | Live canary with real traffic | Ops | **OWNER** |

---

## 9. Pre-flight command summary

```bash
cd backend
export DATABASE_URL="${DATABASE_URL:-postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable}"
export PATH="$HOME/.local/go/bin:$PATH"
export BASE_URL=http://127.0.0.1:18080

./scripts/launch_bootstrap.sh
./scripts/synthetic_health.sh
./scripts/security_scan.sh
./scripts/resilience_drills.sh --local
go test ./...
go test -tags=integration ./test/integration/...
```

Evidence timestamps: `backend/tmp/launch-evidence/README.md`.
