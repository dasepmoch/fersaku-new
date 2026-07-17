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
| Live Xendit dashboard: callback URL + token match secret manager | **OWNER** | Payments: ________ |
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

## 3. Callbacks (Xendit)

| # | Check | How | Proof |
| - | ----- | --- | ----- |
| 3.1 | Invalid token rejected (401/403), no payment side effects | `TestCallback_InvalidToken_RejectionOnly` | Integration suite |
| 3.2 | Missing token rejected | `TestCallback_MissingToken_Rejection` | Integration suite |
| 3.3 | Synthetic invalid token | `scripts/synthetic_health.sh` | Evidence: `03-synthetic-health.txt` |
| 3.4 | Failure-domain test plan + local evidence | `docs/launch/xendit-callback-failure-domain.md` | File + evidence |
| 3.5 | Callback path isolation (inbound ≠ outbound webhooks) | Admin routes + runbook | `docs/runbooks/callback-failure.md` |
| 3.6 | Live Xendit webhook URL points at HA API ingress | Dashboard | **OWNER** |

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
| 5.2 | SUPER_ADMIN attach path | `scripts/seed.sh` + `cmd/seed` | Documented below |
| 5.3 | Optional bootstrap in launch script | `BOOTSTRAP_ADMIN_EMAIL` | `launch_bootstrap.sh` |
| 5.4 | First production admin registered + seeded | Ops | **OWNER** after register/verify |

### Admin bootstrap path (existing authz)

1. Deploy migrations to head (`./scripts/migrate.sh up` as migrate identity).
2. Register user via `POST /v1/auth/register` (or approved invite flow); verify email.
3. Set `BOOTSTRAP_ADMIN_EMAIL=<that email>` and run:

   ```bash
   export DATABASE_URL='postgres://…'   # migrate/app role as documented
   ./scripts/seed.sh
   # or: make seed
   ```

4. Seed attaches **SUPER_ADMIN** only if the user row exists (`cmd/seed`). System roles are **not** re-created by seed (migration owns them).
5. Confirm: login → session has admin permissions; audit append for role assignment if applicable.
6. Unset `BOOTSTRAP_ADMIN_EMAIL` in long-lived env; do not leave bootstrap email as a standing secret.

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
