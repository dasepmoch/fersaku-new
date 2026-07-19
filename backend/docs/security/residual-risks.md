# Residual risks — acceptance register (BE-610 / PROD-G30)

**Purpose:** Document accepted residual risks where critical/high findings are mitigated in-repo or cannot be fully eliminated without out-of-band controls.  
**Acceptance rule:** No unresolved critical/high without an owner-signed residual entry below.

**Auth policy:** Password / magic-link only. **No MFA required** (ADR-0008; do not reopen MFA as a launch gate).

**Money path (ADR-0008):** Payment ingress = **Duitku**; disbursement / payout = **Xendit**. Legacy Xendit QRIS is not the primary payment path.

## Sign-off

| Field | Value |
| ----- | ----- |
| Document version | 1.1 |
| Task | BE-610 + PROD-G30 residual register |
| Date prepared | 2026-07-17; dual-provider update 2026-07-19 |
| Security owner (sign) | ___________________________ / date ________ |
| Product owner (sign) | ___________________________ / date ________ |
| Engineering owner (sign) | ___________________________ / date ________ |

By signing, owners accept the residual risks listed as **Accepted** and confirm that automated negative tests + `scripts/security_scan.sh` show no unresolved critical/high in-repo findings at the evidence date, or that any remaining findings are explicitly listed here.

**Human signatures:** deferred until owners sign (agent prepared doc only — 2026-07-19).

---

## Register

| ID | Risk | Severity if unmitigated | Mitigations in place | Residual severity | Status | Owner |
| -- | ---- | ----------------------- | -------------------- | ----------------- | ------ | ----- |
| RR-001 | External penetration test not run before live money | Critical (unknown) | Full automated negative matrix (SSRF/CSRF/session/tenant/webhook/KYC/credential/impersonation); threat model; scan SLA; security_scan exit 0 | High until pentest | **Accepted** pending external schedule | Security owner |
| RR-002 | Session theft via XSS outside API surface | High | HttpOnly Secure cookies, CSRF double-submit, idle+absolute TTL, rotate on privilege change | Medium | Accepted | Security + FE |
| RR-003 | Insider admin abuse (emergency switches, impersonation) | High | RBAC least privilege, impersonation allowlist, audit chain, reason-required ops | Medium | Accepted | Security owner |
| RR-004 | DNS rebinding race between resolve and dial | Medium | Re-resolve at dial + redirect revalidation in SSRF package | Low | Accepted | Engineering |
| RR-005 | Dependency zero-day after last `govulncheck` | High | BE-610 upgraded AWS SDK, pgx, x/net, x/crypto, chi; go1.25 toolchain via GOTOOLCHAIN; `govulncheck` symbol results clean (exit 0); 7-day critical SLA | Medium | Accepted | Engineering |
| RR-006 | Image base OS CVE in alpine runtime | Medium | Builder `golang:1.25-alpine`; runtime alpine:3.21 non-root; scan note; rebuild on CVE | Low–Medium | Accepted | Engineering |
| RR-007 | No formal external secret scanning SaaS (gitleaks CLI optional) | Medium | `security_scan.sh` ripgrep patterns + optional gitleaks; fail on high-confidence hits | Low | Accepted | Engineering |
| RR-008 | Provider outage / compromise (Duitku payment and/or Xendit disbursement) | High | Dual-provider ADR-0008; separate payment vs payout credentials; runbooks; fail-closed config; no fake mode in production | Medium (business) | Accepted | Product + Payments |
| RR-009 | KYC document retention / legal hold edge cases | Medium | Encryption at rest; retention table in ADR-0004; no browser presign | Low | Accepted | Compliance |
| RR-010 | Rate-limit / DoS under volumetric attack | Medium | Middleware rate limit, timeouts, pool budgets; edge WAF expected | Medium | Accepted | Ops |
| RR-011 | Dual-provider misconfiguration (wrong driver, fake in prod, cross-wired webhooks) | High | `PAYMENT_PROVIDER` / `DISBURSEMENT_PROVIDER` fail-closed; distinct webhook routes; unit/integration matrix (PROD-E20) | Medium | Accepted | Engineering + Ops |
| RR-012 | Full live/sandbox PAID + ledger E2E not closed on demo host (B50) | High (money path unproven end-to-end on deploy) | CreateQRIS sandbox proven; integration checkout+callback tests; canary dry-run only | High until B50 closed or owner waiver | **Accepted** pending redeploy + pay/callback proof | Engineering |
| RR-013 | Deployed API image may lag dual-provider routes (webhook 404 on older image) | High (missed callbacks) | Source routes present; rebuild/redeploy required before live callbacks | Medium until rebuild verified | **Accepted** pending deploy verification | Engineering + Ops |
| RR-014 | Tunnel demo host is not production HA multi-replica | High (availability / single node) | Topology docs; G20 checklist; managed HA is owner gate | Medium (ops) until managed HA | **Accepted** pending ops provision | Ops |

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

---

## External pentest

If external review is unavailable before go-live:

1. Keep **RR-001** Accepted with security owner signature.  
2. Schedule pentest before raising live payment volume / marketing launch.  
3. Track findings under scan SLA (`scan-sla.md`); re-open residual entries for any critical/high not fixed.

## Evidence checklist (fill at sign-off)

- [x] `backend/scripts/security_scan.sh` exit 0 (2026-07-17; report under `backend/tmp/security-scan/`)  
- [x] `go test ./...` PASS (GOTOOLCHAIN=auto / go1.25.12)  
- [x] `go test -tags=integration ./test/integration/ -run TestSecurity_` PASS  
- [x] No open critical/high in called-symbol govulncheck results; external pentest = RR-001  
- [x] Dual-provider residual rows RR-011..014 prepared (PROD-G30, 2026-07-19)  
- [ ] Owner signatures above completed  
