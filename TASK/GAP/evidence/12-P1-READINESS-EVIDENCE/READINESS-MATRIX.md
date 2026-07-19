# Release readiness matrix — GAP-12

**Purpose:** Single source of truth for go-live gates.  
**Rule:** `done` / `pass` only when evidence link exists. Host/demo proof ≠ production claim.  
**Release candidate (code tree):** `196d81236919bafa9d8b054c4ec912760b2b8141` (`gap/production-readiness`)  
**Matrix generated (UTC):** `2026-07-19T20:11:12Z`  
**Expiry default:** 14 days from timestamp unless row says otherwise  
**Launch policy:** KEY-51 **Option 1 launch-subset** (human countersign residual)  
**Pre-LIVE GO:** **NOT READY**

---

## Artifact identity

| Field | Value | Notes |
| ----- | ----- | ----- |
| Git SHA (working tree HEAD) | `196d81236919bafa9d8b054c4ec912760b2b8141` | Includes GAP-01..11 code on branch |
| Manifest file | `release-manifest-rc.json` (this dir) | `releaseId=rc-196d812` |
| Migration head | `35` | verify-manifest OK |
| Local API image Id (`fersaku-api:release-test`) | `sha256:abc3416d41610b258a1defefade43fa7b65358c0f373151f8351ecef1efe84fa` | Built in GAP-05; **not** rebuild of HEAD |
| Local worker image Id | `sha256:c494083fedbab589c2d2a3f200d2c2d1d7df464b1130385dfcbe3683bda5f41f` | Same |
| Local frontend image Id | `sha256:a06cc37176c035747b1e26930316d9d4558710e08eb111890c20ea9bd35b3e7c` | Same |
| API CI image Id (`fersaku-api:ci`) | `sha256:5dea0bc0bc090d1df7a08e1b8f280df7f05d1de4110256622fcde269c3c08c92` | GAP-10 scan host |
| Staging digest == canary digest | **UNVERIFIED** | No dedicated staging promotion run |
| GHCR signed promotion | **BLOCKED** | OWNER — packages:write + workflow_dispatch |

**STALE WARNING:** Placeholder digests in `release/dist/release-manifest.json` (`sha256:aaaa…`) are **invalid for production claim**. Prefer this directory’s `release-manifest-rc.json` with real local Ids. Rebuild all three images from HEAD before any staging/canary promote.

---

## Legend

| Result | Meaning |
| ------ | ------- |
| `PASS` | Command/output evidence exists for claimed environment |
| `PASS-HOST` | Pass on demo/local host only — not production |
| `PASS-CODE` | Unit/integration/code contract only |
| `STALE` | Older evidence; do not reuse for new production claim |
| `FAIL` | Gate red |
| `BLOCKED` | Cannot complete without owner/infra/credentials |
| `PENDING` | Not run yet |
| `WAIVED` | Explicit signed waiver required (none signed yet) |
| `OWNER` | Human-only row; agent cannot close |

---

## Matrix (keyed by gate)

| ID | Gate | Owner | Sev | Prerequisite | Command / proof | Result | Timestamp UTC | Expiry | Evidence |
| -- | ---- | ----- | --- | ------------ | --------------- | ------ | ------------- | ------ | -------- |
| RM-P0-01 | Duitku HMAC + merchantOrderId contract | eng | P0 | — | `go test ./internal/adapters/duitku/...` (+ app packages) | PASS-CODE | 2026-07-20 | 2026-08-03 | `TASK/GAP/evidence/01-P0-DUITKU-CONTRACT/` |
| RM-P0-02 | Malware scan port + object/KYC fail-closed | eng | P0 | — | `go test ./internal/adapters/malware/ ./internal/application/ …` | PASS-CODE | 2026-07-20 | 2026-08-03 | `TASK/GAP/evidence/02-P0-MALWARE-SCAN.md` |
| RM-P0-02b | Live ClamAV / signature HA on prod | OWNER | P0 | RM-P0-02 | `MALWARE_SCANNER_ADDRESS` + HA runbook | BLOCKED | — | — | same (BLOCKED section) |
| RM-P0-03 | Trusted proxy + class rate-limit | eng | P0 | — | unit: middleware/config; wiring `TrustedProxies` from config | PASS-CODE | 2026-07-19T20:10Z | 2026-08-02 | re-run `raw/gate-*.txt`; no dedicated GAP-03 evidence dir |
| RM-P0-03b | Multi-replica LB proxy storm test | OWNER | P1 | RM-P0-03 | 20-client / 2-replica behind real LB | PENDING | — | — | — |
| RM-P0-04 | Quality gates (fmt/vet/test/lint/type/cov/build) | eng | P0 | — | gofmt/vet/test + FE format/eslint/typecheck/coverage/build | PASS (GAP-04 day) | 2026-07-20 | 2026-08-03 | `TASK/GAP/evidence/04-P0-QUALITY-GATES/` |
| RM-P0-04b | gofmt clean at matrix time | eng | P0 | — | `gofmt -l .` → empty after telemetry fix | PASS | 2026-07-19T20:11Z | 2026-08-02 | this matrix + commit intent |
| RM-P0-05 | Release manifest + local image build | eng | P0 | — | generate/verify-manifest + docker build api/worker/fe | PASS-HOST | 2026-07-20 | 2026-08-03 | `TASK/GAP/evidence/05-P0-RELEASE-DEPLOYMENT/` |
| RM-P0-05b | Staging/prod promote by digest + cosign | OWNER | P0 | RM-P0-05 | release.yml publish + REQUIRE_SIGNATURE | BLOCKED | — | — | GAP-05 BLOCKED |
| RM-P0-06 | Deploy gate callbacks not 404 | eng | P0 | running API | `./scripts/release/deploy-gate.sh` | PASS-HOST | 2026-07-19T20:10:37Z | 2026-08-02 | `raw/gate-2026-07-19T201029Z.txt` |
| RM-P0-07 | Host dual-provider sandbox PAID+ledger | eng | P0 | dual-provider image | B50 path | PASS-HOST | 2026-07-19 | 2026-08-02 | `TASK/PROD/evidence/PROD-B50/` |
| RM-P0-08 | Headed E2E launch-subset (demo host) | eng | P0 | KEY-50/51 | Playwright full suite 14/14 | PASS-HOST STALE for staging | 2026-07-19 | 2026-08-02 | `TASK/PROD/E2E/STATUS.md` |
| RM-P0-09 | Staging dual-provider parity (KEY-22) | OWNER | P0 | managed stack | dedicated staging boot | PENDING | — | — | KEY-22 pending |
| RM-P0-10 | Staging headed E2E re-run (KEY-52) | eng/OWNER | P0 | KEY-22 | same journeys on staging artifact | PENDING | — | — | KEY-52 pending |
| RM-P0-11 | Cookie/HTTPS/CSRF public edge | eng | P0 | — | KEY-32/33 | PASS-HOST | 2026-07-19 | 2026-08-02 | `TASK/PROD/evidence/KEY-32/` `KEY-33/` |
| RM-P0-12 | API/FE production fail-closed | eng | P0 | — | KEY-30/31 unit + env contract | PASS-CODE | 2026-07-19 | 2026-08-02 | `KEY-30/` `KEY-31/` |
| RM-P0-13 | Live money canary + rollback | OWNER | P0 | KEY-61 green + GO | KEY-62 / G40 | BLOCKED | — | — | `PROD-G40/` `KEY-62` |
| RM-P0-14 | Residual-risk human signatures | OWNER | P0 | matrix truthful | sign residual-risks.md | BLOCKED | — | — | KEY-60 blank |
| RM-P0-15 | Secret manager populated (no values in git) | OWNER | P0 | KEY-10 templates | SM paths staging+prod | BLOCKED | — | — | KEY-10 residual |
| RM-P0-16 | Managed PG/Redis/R2/SMTP | OWNER | P0 | KEY-11..14 runbooks | cloud provision + drills | BLOCKED | — | — | KEY-11..14 managed residual |
| RM-P1-01 | Capacity / migrate guards | eng | P1 | — | config budget + migrate refuse paths | PASS-CODE | 2026-07-20 | 2026-08-03 | `06-P1-CAPACITY-MIGRATION/` |
| RM-P1-02 | Observability OTEL/FE sink + alerts catalog | eng | P1 | — | unit + catalog | PASS-CODE | 2026-07-20 | 2026-08-03 | `07-P1-OBSERVABILITY/` |
| RM-P1-02b | Live collector / pager route test | OWNER | P1 | RM-P1-02 | staging OTEL + alert fire | BLOCKED | — | — | same |
| RM-P1-03 | Live data truth (no fixture admin users) | eng | P1 | — | gap-08 unit 14 tests | PASS-CODE | 2026-07-19T20:10Z | 2026-08-02 | FE `gap-08-live-data-truth`; no GAP-08 evidence dir |
| RM-P1-04 | Legal public surface (no placeholder) | eng | P1 | — | gap-09 unit + pages | PASS-CODE | 2026-07-20 | 2026-08-03 | `09-P1-LEGAL-PUBLIC-SURFACE/` |
| RM-P1-04b | Counsel/owner legal approval | OWNER | P1 | RM-P1-04 | signed version bump | BLOCKED | — | — | same |
| RM-P1-05 | Supply chain audit/SBOM/digest pin | eng | P1 | — | npm-audit-gate + iac + grype critical | PASS-HOST | 2026-07-20 | 2026-08-03 | `10-P1-SUPPLY-CHAIN/` |
| RM-P1-06 | DR local dump→clone E2E | eng | P1 | compose stack | `dr_restore_e2e.sh` | PASS-HOST | 2026-07-19T20:08Z | 2026-10-17 next drill | `11-P1-DR-BACKUP-E2E/` |
| RM-P1-06b | Managed PITR RPO≤5m RTO≤60m | OWNER | P1 | managed PG | cloud restore drill | BLOCKED | — | — | KEY-11 residual |
| RM-P1-07 | KEY-51 launch-subset waiver signed | OWNER | P1 | package written | Product/Eng/Security ink | BLOCKED | — | — | `KEY-51/` |

---

## Enabled-domain journey coverage (launch-subset)

Per KEY-51 §2. Staging column empty until KEY-22/52.

| Journey | Demo/host headed | Staging headed | Live canary | Evidence |
| ------- | ---------------- | -------------- | ----------- | -------- |
| Register / verify / login (no MFA) | PASS-HOST | PENDING | BLOCKED | E2E-02/03/04/11, F10 |
| Seller onboarding / KYC scan CLEAN | CODE + partial UI | PENDING | BLOCKED | GAP-02 code; live scanner BLOCKED |
| Product upload / scan | CODE | PENDING | BLOCKED | GAP-02; E2E-10 products smoke only |
| Storefront publish | PASS-HOST (API public) | PENDING | BLOCKED | E2E-01; full builder OUT of subset |
| QRIS pending / paid / expired / unknown | paid+pending host | PENDING | BLOCKED | E2E-05/06, B50; expired/unknown not full matrix |
| Callback replay | PASS-HOST | PENDING | BLOCKED | KEY-40, B50 |
| Delivery | not launch-subset claimed | — | — | deferred full matrix |
| Withdrawal lifecycle | quote UI + sandbox WD optional | PENDING | BLOCKED | E2E-08, KEY-41/42; live bank BLOCKED |
| Admin audit / impersonation guard | CODE + admin read UI | PENDING | BLOCKED | E2E-09, E2E-12; impersonation unit |

**Explicit OUT of launch-subset (do not claim):** full catalog/storefront builder E2E, full admin command matrix, Google OAuth, contact submit, campaigns, refund console, live bank without GO.

---

## Canary / rollback

| Item | Result | Evidence |
| ---- | ------ | -------- |
| Sandbox canary dry-run health | PASS-HOST | `PROD-F40/canary-sandbox.md` |
| Sandbox PAID+ledger (not live money) | PASS-HOST | B50 / KEY-40 |
| Live canary cohort/amount/SLO | BLOCKED OWNER | KEY-61 §7 🟥 |
| Rollback rehearsal (digest) | PASS-CODE dry-run scripts | GAP-05 `canary-rollback.sh` |
| Rollback rehearsal on staging/prod | BLOCKED | no managed CD |
| No-money-anomaly signoff | BLOCKED | needs live canary |

---

## Staging parity checklist (KEY-22)

| Dimension | Required | State |
| --------- | -------- | ----- |
| Same artifact digest as candidate | yes | UNVERIFIED |
| Config schema version match | yes | schema v1 in manifest |
| Route surface (webhooks mounted) | yes | host only re-proven 2026-07-19T20:10Z |
| Provider sandbox mode explicit | yes | code fail-closed; staging env OWNER |
| Scanner real/stub equivalent | yes | stub OK for int; prod needs address |
| LB trusted proxy CIDRs | yes | code; staging CIDR OWNER |
| Redis multi-class limiter | yes | code; managed Redis OWNER |
| Object storage (R2 not MinIO) | yes | runbook; provision OWNER |
| SMTP production | yes | runbook; provision OWNER |
| Worker topology | yes | image exists; staging deploy OWNER |

---

## Go-live decision

| Check | State |
| ----- | ----- |
| Unresolved P0 in matrix | **YES** — RM-P0-02b, 05b, 09, 10, 13, 14, 15, 16 |
| Approved P1 waivers | **NONE signed** |
| Staging digest == canary | **NO** |
| Residual-risk signatures | **BLANK** |
| **Pre-LIVE GO** | **NOT READY** |

### Agent attestation (not a product GO)

| Role | Name | Date UTC | Note |
| ---- | ---- | -------- | ---- |
| Matrix author | @opencode | 2026-07-19T20:11Z | Truthful reconcile only |
| Product | — | — | Required for KEY-51/60/62 |
| Security | — | — | Required for residual-risks |
| Engineering | — | — | Required for promote |

---

## Secrets check

- [x] no keys, tokens, cookies, or KYC payloads in this file
- [x] image digests are content Ids only
