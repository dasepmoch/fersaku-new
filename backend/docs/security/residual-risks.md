# Residual risks — acceptance register (BE-610 / PROD-G30 / GAP-12)

**Purpose:** Document accepted residual risks where critical/high findings are mitigated in-repo or cannot be fully eliminated without out-of-band controls.  
**Acceptance rule:** No unresolved critical/high without an owner-signed residual entry below.  
**Readiness matrix:** `TASK/GAP/evidence/12-P1-READINESS-EVIDENCE/READINESS-MATRIX.md`  
**Pre-LIVE GO:** **NOT READY** until P0 matrix rows and owner signatures below are closed.

**Auth policy:** Password / magic-link only. **No MFA required** (ADR-0008; do not reopen MFA as a launch gate).

**Money path (ADR-0008):** Payment ingress = **Duitku**; disbursement / payout = **Xendit**. Legacy Xendit QRIS is not the primary payment path.

## Sign-off

| Field | Value |
| ----- | ----- |
| Document version | 1.4 |
| Task | BE-610 + PROD-G30 + GAP-10 + GAP-12 readiness reconcile |
| Date prepared | 2026-07-17; dual-provider 2026-07-19; B50 KEY-01 2026-07-19; GAP-10 2026-07-20; GAP-12 2026-07-20 |
| Security owner (sign) | ___________________________ / date ________ |
| Product owner (sign) | ___________________________ / date ________ |
| Engineering owner (sign) | ___________________________ / date ________ |

By signing, owners accept the residual risks listed as **Accepted** and confirm that automated negative tests + `scripts/security_scan.sh` show no unresolved critical/high in-repo findings at the evidence date, or that any remaining findings are explicitly listed here.

**Human signatures:** deferred until owners sign (agent prepared doc only — 2026-07-19; expanded 2026-07-20).

---

## Register

| ID | Risk | Severity if unmitigated | Mitigations in place | Residual severity | Status | Owner |
| -- | ---- | ----------------------- | -------------------- | ----------------- | ------ | ----- |
| RR-001 | External penetration test not run before live money | Critical (unknown) | Full automated negative matrix (SSRF/CSRF/session/tenant/webhook/KYC/credential/impersonation); threat model; scan SLA; security_scan exit 0 | High until pentest | **Accepted** pending external schedule | Security owner |
| RR-002 | Session theft via XSS outside API surface | High | HttpOnly Secure cookies, CSRF double-submit, idle+absolute TTL, rotate on privilege change | Medium | Accepted | Security + FE |
| RR-003 | Insider admin abuse (emergency switches, impersonation) | High | RBAC least privilege, impersonation allowlist, audit chain, reason-required ops | Medium | Accepted | Security owner |
| RR-004 | DNS rebinding race between resolve and dial | Medium | Re-resolve at dial + redirect revalidation in SSRF package | Low | Accepted | Engineering |
| RR-005 | Dependency zero-day after last `govulncheck` | High | BE-610 upgraded AWS SDK, pgx, x/net, x/crypto, chi; go1.25 toolchain via GOTOOLCHAIN; `govulncheck` symbol results clean (exit 0); 7-day critical SLA | Medium | Accepted | Engineering |
| RR-006 | Image base OS CVE in alpine runtime | Medium | Base digests pinned; Syft/Grype in CI; rebuild on CVE; non-root | Low | Accepted | Engineering |
| RR-015 | Next nested postcss moderate XSS (GHSA-qx2v-qp2m-jg93) | Moderate | `overrides.postcss@8.5.10`; npm-audit-gate; rejected `audit fix --force`→next@9 | Low (mitigated) | **Mitigated** until Next ships fixed postcss; exception expires 2026-10-20 | FE engineering |
| RR-007 | No formal external secret scanning SaaS (gitleaks CLI optional) | Medium | `security_scan.sh` ripgrep patterns + optional gitleaks; fail on high-confidence hits | Low | Accepted | Engineering |
| RR-008 | Provider outage / compromise (Duitku payment and/or Xendit disbursement) | High | Dual-provider ADR-0008; separate payment vs payout credentials; runbooks; fail-closed config; no fake mode in production | Medium (business) | Accepted | Product + Payments |
| RR-008b | Provider contract drift (HMAC, lookup id, callback ack) | High | GAP-01: HMAC-SHA256, merchantOrderId, SUCCESS ack; unit matrix; docs freeze 2026-07-20 | Medium | **Accepted** pending live sandbox credential re-proof on staging | Engineering + Payments |
| RR-009 | KYC document retention / legal hold edge cases | Medium | Encryption at rest; retention table in ADR-0004; no browser presign | Low | Accepted | Compliance |
| RR-010 | Rate-limit / DoS under volumetric attack | Medium | Class-based limiter + trusted proxy CIDRs; timeouts; pool budgets; edge WAF expected | Medium | Accepted | Ops |
| RR-010b | Trusted proxy / LB misconfig (XFF spoof or shared bucket) | High | `TRUSTED_PROXY_*` fail-closed on live; unit matrix multi-hop/spoof; RateLimitByClass | Medium until staging LB proof | **Accepted** pending KEY-22 multi-replica proof | Engineering + Ops |
| RR-011 | Dual-provider misconfiguration (wrong driver, fake in prod, cross-wired webhooks) | High | `PAYMENT_PROVIDER` / `DISBURSEMENT_PROVIDER` fail-closed; distinct webhook routes; unit/integration matrix (PROD-E20) | Medium | Accepted | Engineering + Ops |
| RR-012 | ~~Sandbox PAID + ledger E2E not closed on demo host~~ **CLOSED** | — | **PROD-B50 CLOSED 2026-07-19:** dual-provider host path intent → Duitku signed callback → PAID → settlement×1 + ledger credit; replay-safe. Also re-proven in PROD E2E-05/06 headed re-run. | Residual for **LIVE** money only → tracked as RR-012b / KEY-62 | **Closed (sandbox/host)** | Engineering |
| RR-012b | Production LIVE money canary not executed | High (first live pay) | Sandbox path proven (B50); G40/KEY-62 owner-gated; no agent live money without `GO LIVE CANARY` | High until KEY-62 | **Accepted** pending human GO | Product + Engineering |
| RR-013 | ~~Deployed API image lag dual-provider (webhook 404)~~ **CLOSED on host** | — | Host image rebuilt; `POST /v1/webhooks/duitku` empty body → **401** (mounted); B50 + E2E-06; GAP-12 re-run 2026-07-19T20:10Z | Residual: **staging/prod** image tag must stay dual-provider (KEY-22/31) | **Closed (demo host)**; ops verify each env | Engineering + Ops |
| RR-014 | Tunnel demo host is not production HA multi-replica | High (availability / single node) | Topology docs; G20 checklist; KEY-11..14 managed platform runbooks; GAP-11 local DR | Medium (ops) until managed HA live | **Accepted** pending KEY-11..14 **provision** (runbooks alone insufficient) | Ops |
| RR-016 | Production malware scanner not deployed (ClamAV/address HA) | High (upload/KYC) | GAP-02 port + fail-closed object/KYC without CLEAN; stub for integration; metrics + quarantine runbook | High until RM-P0-02b | **Open / BLOCKED owner** — adapter ready; needs `MALWARE_SCANNER_ADDRESS` + HA | Ops + Security |
| RR-017 | Observability sink incomplete (no live OTEL collector / pager route) | Medium | GAP-07 process tracer + FE reporter + RED metrics + alert catalog; drop-on-full queue | Medium | **Accepted** pending staging collector + alert route test | Ops + Engineering |
| RR-018 | Capacity / connection budget mis-tune under load | Medium | GAP-06 role pool defaults + over-budget fail-closed + migrate guards | Medium | **Accepted** pending load test on managed sizes | Engineering + Ops |
| RR-019 | Legal copy not counsel-approved | Medium (launch hygiene) | GAP-09 removed placeholders; version `2026-07-20-ops`; cookie inventory honest | Medium | **Open / BLOCKED owner** until counsel sign | Product + Legal |
| RR-020 | Supply-chain unsigned promote / mutable tags | High | GAP-10 digest pins, npm-audit-gate, SBOM/Grype, cosign required on publish path | Medium until GHCR publish proves sign | **Accepted** pending managed registry CD | Engineering + Ops |
| RR-021 | Disaster recovery only proven locally | High (RPO/RTO) | GAP-11 local dump→clone E2E + object inventory fail path; quarterly date recorded | High until managed PITR drill | **Open / BLOCKED owner** for managed RPO≤5m RTO≤60m | Ops |
| RR-022 | Staging headed E2E / digest parity missing | High (false green go-live) | Host E2E 14/14 + KEY-51 launch-subset; KEY-22/52 pending; GAP-12 matrix blocks GO | High | **Open** — KEY-22/52 | Engineering + Ops |
| RR-023 | Placeholder release digests (`aaaa…`) if promoted | High | GAP-05/12 real local Ids in `release-manifest-rc.json`; verify-manifest REQUIRE_DIGESTS | High if misused | **Mitigated by process** — forbid `release/dist` placeholder for promote | Engineering |

---

## Domain status snapshot (GAP-12)

| Domain | In-repo mitigation | Runtime / owner residual |
| ------ | ------------------ | ------------------------ |
| Scanner (malware) | Port + fail-closed + metrics | Live ClamAV/HA **BLOCKED** (RR-016) |
| Provider contract | HMAC-SHA256 Duitku + Xendit webhooks | Staging sandbox re-proof **PENDING** (RR-008b) |
| Proxy / rate-limit | Trusted CIDR + class budgets | Multi-replica LB proof **PENDING** (RR-010b) |
| Observability | OTEL wiring + FE sink + alerts catalog | Live collector/pager **BLOCKED** (RR-017) |
| Capacity | Pool budget + migrate refuse | Managed load **PENDING** (RR-018) |
| Legal | No placeholder pages + cookie inventory | Counsel approval **BLOCKED** (RR-019) |
| Supply-chain | Digest pin, audit gate, SBOM, cosign contract | GHCR signed promote **BLOCKED** (RR-020) |
| DR | Local E2E restore + object check | Managed PITR **BLOCKED** (RR-021) |

---

## Explicitly not residual (closed by design)

| Topic | Closure evidence |
| ----- | ---------------- |
| SSRF private URL on seller webhooks | Integration + unit tests |
| CSRF on cookie unsafe methods | Middleware + security verification tests |
| Session past expiry still valid | ResolveSession absolute/idle checks + test |
| Cross-tenant store/object access | 404 policy + tests |
| KYC browser presign | `RejectKYCPresign` + tests |
| Raw API key in list/DB | Credentials tests |
| Impersonation default-deny | Allowlist registry + integration tests |
| Sandbox→live ledger bleed | Mode isolation + gateway/ledger tests |
| Runtime fee policy mutation | 405 + immutable seed |
| MFA as launch requirement | Out of policy — **no MFA**; password / magic-link only |
| Admin live users fixture dual-branch | GAP-08 unit + architecture guard (demoSellerUsers mock-only) |

---

## External pentest

If external review is unavailable before go-live:

1. Keep **RR-001** Accepted with security owner signature.  
2. Schedule pentest before raising live payment volume / marketing launch.  
3. Track findings under scan SLA (`scan-sla.md`); re-open residual entries for any critical/high not fixed.

## Evidence checklist (fill at sign-off)

- [x] `backend/scripts/security_scan.sh` exit 0 (2026-07-17; report under `backend/tmp/security-scan/`)  
- [x] `go test ./...` PASS on GAP-04 evidence date (GOTOOLCHAIN=auto)  
- [x] `go test -tags=integration ./test/integration/ -run TestSecurity_` PASS (historical)  
- [x] No open critical/high in called-symbol govulncheck results; external pentest = RR-001  
- [x] Dual-provider residual rows RR-011..014 prepared (PROD-G30, 2026-07-19)
- [x] GAP-10: npm-audit-gate PASS (0 vulns after postcss override); image digests pinned; iac-scan PASS; grype fail-on critical PASS (2026-07-20)  
- [x] RR-012/013 reconciled after B50 CLOSED (KEY-01, 2026-07-19); LIVE residual = RR-012b  
- [x] GAP-12 readiness matrix authored; host deploy-gate re-run PASS (2026-07-19T20:10Z)  
- [x] RR-016..023 domain residuals documented (scanner, proxy, obs, capacity, legal, SC, DR, staging)  
- [ ] Owner signatures above completed  
- [ ] KEY-22 staging parity + KEY-52 headed E2E  
- [ ] KEY-62 live canary after explicit `GO LIVE CANARY`  
