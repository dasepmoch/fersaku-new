# BE-630 E2E acceptance ↔ global matrix (§16)

Maps every row of `docs/BACKEND_PRODUCTION_TASKS.md` §16 to concrete proof. 
Evidence run timestamps: `backend/tmp/launch-evidence/`.

| Requirement | Proof (tests / scripts / docs) | Evidence file |
| ----------- | ------------------------------ | ------------- |
| Mandatory store | `test/integration/onboarding_test.go` (complete w/o product, last-store guard); migration onboarding constraints | `11-go-integration.txt` |
| API-only KYC | `kyc_test.go` + `gateway_test.go` (live denied before capability; storefront not forced) | `11-go-integration.txt` |
| Dual money path (ADR-0008) | Payment QRIS: Duitku (`PAYMENT_PROVIDER=duitku`, `adapters/duitku`); disbursement: Xendit (`DISBURSEMENT_PROVIDER=xendit`, `XENDIT_ACCOUNT_SCOPE=xendit-primary`). Xendit QRIS code kept unwired (PROD-B40 option A). Xendit payment webhook may remain for historical/late events but is not the primary create path when payment=duitku. | ADR-0008 + composition tests |
| Launch fee invariant | `fees_test.go` domain + integration (100k→3700/96300); `RejectFeeMutation` 405; seed `LAUNCH_FEE_POLICY_V1` | unit + `11-go-integration.txt` |
| All scoped features free | ADR-0006; no plan/entitlement schema; fee never gates access | ADR + OpenAPI |
| Unified wallet | `ledger_test.go` source totals sum; rebuild equals projection | `11-go-integration.txt` |
| Sandbox isolation | `TestCallback_CrossPaymentMode_NoCollision`; gateway sandbox without KYC | `11-go-integration.txt` |
| Withdrawal policy | `withdrawals_test.go` min 50k, fee math, concurrent overspend impossible | `11-go-integration.txt` |
| No refund/dispute | ADR-0005; OpenAPI/status negative (no refund routes) | ADR + OpenAPI |
| No reconciliation console | No admin recon endpoints; mismatch via internal alerts only | OpenAPI + admin routes |
| Callback safety | `callbacks_test.go` four-part key, invalid token, 80× duplicate | `11` + `12-callback-failure-domain.txt` |
| Paid precedence | `TestCallback_LatePaidAfterExpire` | `11-go-integration.txt` |
| Admin operations | `admin_ops_test.go` 8 ops permission/reason/audit | `11-go-integration.txt` |
| Audit integrity | `audit_chain_test.go` concurrent, tamper, checkpoint | `11-go-integration.txt` |
| Impersonation | `impersonation_test.go` + allowlist unit tests | `11-go-integration.txt` |
| R2 privacy | `objects_test.go` cross-tenant/incomplete/KYC presign reject | `11-go-integration.txt` |
| Redis non-authority | `scripts/resilience_drills.sh --local` Redis FLUSHDB | `05-resilience-drills.txt` |
| Security | threat model, authz matrix, `security_scan.sh`, `TestSecurity_*` | `04-security-scan.txt` + BE-610 docs |
| Retention | ADR-0004 / ADR-0007 retention owners; analytics policy seed | ADR + migrations |
| Production topology | ADR-0007; `docs/launch/topology.md`; pool/drain docs; HA claim | launch docs |
| UI unchanged | FE `vitest run` / optional playwright smoke without redesign | `20-fe-vitest.txt` (or skip note) |

---

## Gate commands (mandatory)

```bash
cd backend
export DATABASE_URL=postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable
export PATH="$HOME/.local/go/bin:$PATH"
export BASE_URL=http://127.0.0.1:18080
export MAILPIT_URL=http://127.0.0.1:8025

go test ./...
go test -tags=integration ./test/integration/...
./scripts/synthetic_health.sh
./scripts/security_scan.sh
./scripts/resilience_drills.sh --local
```

Frontend (repo root; no UI redesign):

```bash
# Prefer unit/contract only for launch evidence
npm run test:run
# Optional if browsers installed and env ready:
# npm run test:e2e:smoke
```

---

## FE contract note

Backend OpenAPI + existing FE adapters remain the contract boundary. BE-630 does **not** change UI design. Green vitest (and optional smoke e2e) proves routes/contracts still compile/run against mocks/adapters.

---

## Owner-sign residual

Live production money canary and external pentest (RR-001) remain **OWNER** after this package.
