# Residual risks — acceptance register (BE-610)

**Purpose:** Document accepted residual risks where critical/high findings are mitigated in-repo or cannot be fully eliminated without out-of-band controls.  
**Acceptance rule:** No unresolved critical/high without an owner-signed residual entry below.

## Sign-off

| Field | Value |
| ----- | ----- |
| Document version | 1.0 |
| Task | BE-610 Security verification |
| Date prepared | 2026-07-17 |
| Security owner (sign) | ___________________________ / date ________ |
| Product owner (sign) | ___________________________ / date ________ |
| Engineering owner (sign) | ___________________________ / date ________ |

By signing, owners accept the residual risks listed as **Accepted** and confirm that automated negative tests + `scripts/security_scan.sh` show no unresolved critical/high in-repo findings at the evidence date, or that any remaining findings are explicitly listed here.

---

## Register

| ID | Risk | Severity if unmitigated | Mitigations in place | Residual severity | Status | Owner |
| -- | ---- | ----------------------- | -------------------- | ----------------- | ------ | ----- |
| RR-001 | External penetration test not run before live money | Critical (unknown) | Full automated negative matrix (SSRF/CSRF/session/tenant/webhook/KYC/credential/impersonation); threat model; scan SLA; security_scan exit 0 | High until pentest | **Accepted** pending external schedule | Security owner |
| RR-002 | Session theft via XSS outside API surface | High | HttpOnly Secure cookies, CSRF double-submit, idle+absolute TTL, rotate on privilege change | Medium | Accepted | Security + FE |
| RR-003 | Insider admin abuse (emergency switches, impersonation) | High | RBAC least privilege, MFA on admin, impersonation allowlist, audit chain, reason-required ops | Medium | Accepted | Security owner |
| RR-004 | DNS rebinding race between resolve and dial | Medium | Re-resolve at dial + redirect revalidation in SSRF package | Low | Accepted | Engineering |
| RR-005 | Dependency zero-day after last `govulncheck` | High | BE-610 upgraded AWS SDK, pgx, x/net, x/crypto, chi; go1.25 toolchain via GOTOOLCHAIN; `govulncheck` symbol results clean (exit 0); 7-day critical SLA | Medium | Accepted | Engineering |
| RR-006 | Image base OS CVE in alpine runtime | Medium | Builder `golang:1.25-alpine`; runtime alpine:3.21 non-root; scan note; rebuild on CVE | Low–Medium | Accepted | Engineering |
| RR-007 | No formal external secret scanning SaaS (gitleaks CLI optional) | Medium | `security_scan.sh` ripgrep patterns + optional gitleaks; fail on high-confidence hits | Low | Accepted | Engineering |
| RR-008 | Provider (Xendit) outage / compromise | High | Single-provider ADR; runbooks; fail-closed config; no fake mode in prod | Medium (business) | Accepted | Product + Payments |
| RR-009 | KYC document retention / legal hold edge cases | Medium | Encryption at rest; retention table in ADR-0004; no browser presign | Low | Accepted | Compliance |
| RR-010 | Rate-limit / DoS under volumetric attack | Medium | Middleware rate limit, timeouts, pool budgets; edge WAF expected | Medium | Accepted | Ops |

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

