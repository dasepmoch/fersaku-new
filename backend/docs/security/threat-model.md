# Fersaku backend threat model (BE-610)

**Scope:** production Go API + worker (modular monolith). 
**Method:** STRIDE-lite (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege). 
**Date:** 2026-07-17 
**Status:** In-repo security verification evidence for BE-610.

## Trust boundaries

| Boundary | Trusted | Untrusted |
| -------- | ------- | --------- |
| Browser cookie session | Server session row (hash), CSRF double-submit | Cookie value, headers, body |
| Merchant API key (gateway) | Key hash + capability + mode | Raw key on wire (once), request body |
| Xendit inbound webhook | Shared callback token / signature verification | Payload, IP, replay |
| Seller outbound webhook | HMAC signing secret (server) | Endpoint URL, merchant receiver |
| R2 / object store | Server-generated keys, private buckets | Browser presign (non-KYC only) |
| Admin surface | RBAC permissions + auth policy | Admin session, impersonation derived session |
| Postgres | Authoritative financial/auth truth | Redis (non-authoritative), client input |

## Asset classes

- Session tokens, CSRF tokens, auth secrets/security codes (unused) 
- Merchant API keys and webhook signing secrets 
- Payment intents, ledger journals, withdrawal state 
- KYC document ciphertext and case metadata 
- Inventory CODE credentials (AEAD at rest) 
- Admin impersonation linkage (actor ↔ target) 
- Provider callback evidence (encrypted/raw retention policy)

---

## Payments (hosted checkout + QRIS gateway)

| Threat | STRIDE | Mitigation | Residual |
| ------ | ------ | ---------- | -------- |
| Spoof payment create with client-supplied price | T | Server price authority; client amount ignored for catalog | Low |
| Replay / duplicate paid callback | T/R | Four-part provider event key; exactly-once settlement | Low |
| Sandbox lot credited to live wallet | E | Mode isolation on intents/events/capabilities | Low |
| Fake Xendit in production | S/E | Config fail-closed (`XENDIT_MODE=fake` rejected in production) | Low |
| Overspend on concurrent withdraw | T | Ledger reserve + DB locks; integration concurrency tests | Low |
| Fee mutation via admin API | E | Immutable launch fee policy; mutation routes 405 | Low |
| DoS on create payment | D | Rate limits, timeouts, pool budgets | Medium (ops) |

**Negative tests:** checkout client price ignored; callback invalid token; concurrent paid; withdrawal min/fee; gateway live without KYC denied.

---

## KYC (live API only)

| Threat | STRIDE | Mitigation | Residual |
| ------ | ------ | ---------- | -------- |
| Browser-to-R2 KYC upload (object takeover / key guess) | I/T | Explicit `RejectKYCPresign`; server-mediated upload + AEAD | Low |
| Cross-tenant case access | I/E | Tenant resolve → `RESOURCE_NOT_FOUND` | Low |
| Approve without docs / without reason on reject | E | State machine + admin reason required | Low |
| Live API key before capability | E | Capability gate on LIVE create/claim | Low |
| KYC forced for storefront-only sellers | E (product) | KYC only for live QRIS API (product rule) | Accepted product residual |

**Negative tests:** `/v1/me/kyc/presign` 400; live credential without KYC denied; reject requires reason.

---

## Webhooks (inbound provider + outbound seller)

| Threat | STRIDE | Mitigation | Residual |
| ------ | ------ | ---------- | -------- |
| SSRF via seller webhook URL | I/E | HTTPS-only; block private/link-local/metadata/CGNAT; DNS rebind re-check each delivery | Low |
| Signature forgery / secret leak in list | S/I | HMAC v1; secrets claim-once; list never raw | Low |
| Inbound replay / wrong mode collision | T | Canonical event id + mode partition | Low |
| Admin confuses inbound vs outbound queues | R/E | Separate permissions and namespaces | Low |
| Open redirect allowlist fetch | I | Redirect origins allowlisted, never network-fetched | Low |

**Negative tests:** private network URL reject (integration + unit SSRF); webhook secret not in list; inbound token rejection.

---

## Admin operations

| Threat | STRIDE | Mitigation | Residual |
| ------ | ------ | ---------- | -------- |
| Unscoped merchant list without permission | I | `merchants.read` required; 403 otherwise | Low |
| Emergency switch abuse | E/D | `platform.emergency` + reason + audit | Medium (insider) |
| MIXED source on payments filter abuse | T | Reject invalid source combinations | Low |
| Secret fields in admin reads | I | Redacted DTOs; no raw keys/PII dumps | Low |
| Mutation without reason/audit | R | Admin ops require reason; audit chain (BE-530) | Low |

**Negative tests:** admin reads 403 without admin; no secrets in responses; emergency permissioned.

---

## Impersonation

| Threat | STRIDE | Mitigation | Residual |
| ------ | ------ | ---------- | -------- |
| Full/privileged scope | E | Only `READ_ONLY` / `SUPPORT_WRITE` in DB/API | Low |
| Admin permissions unioned into target | E | Effective auth = target ∩ scope | Low |
| Support write beyond allowlist | E | Exact two commands; default-deny registry | Low |
| Tampered derived cookie | S | Opaque hashed session; end/expiry revokes | Low |
| Nested / admin-to-admin | E | Explicit target user; no admin targets | Low |
| Missing auth on start | S/E | Authenticated admin session required for start | Low |

**Negative tests:** PRIVILEGED rejected; SUPPORT_WRITE default-deny mutations; tampered cookie; end blocks; allowlist unit tests.

---

## Sessions / CSRF / uploads

| Threat | STRIDE | Mitigation | Residual |
| ------ | ------ | ---------- | -------- |
| Session fixation / theft | S | Rotate on privilege change; HttpOnly Secure; idle 12h + absolute 30d | Medium (XSS outside API) |
| CSRF on cookie mutations | T | Double-submit `X-CSRF-Token` vs session hash | Low |
| Expired session still accepted | S | Resolve checks idle + absolute expiry | Low |
| Cross-tenant object download | I | Store-scoped object_ref; 404 | Low |
| Incomplete/checksum fail complete | T | Object complete validation | Low |

**Negative tests:** CSRF missing/wrong token → `AUTH_CSRF_INVALID`; session past `expires_at` → 401; cross-tenant object/store 404.

---

## Credentials

| Threat | STRIDE | Mitigation | Residual |
| ------ | ------ | ---------- | -------- |
| Raw key stored or listed | I | Hash only; claim once; list masked | Low |
| Double claim | E | Single-use claim token | Low |
| Revoked key still works | S | Status check on resolve | Low |
| Admin authorize returns raw | I | Admin paths never emit raw key | Low |

**Negative tests:** raw not in DB/list; double claim fails; revoke fails gateway; admin never raw.

---

## Out of scope for this model (documented non-goals)

- Refund/dispute workflows, multi-PSP failover, reconciliation console 
- Paid feature entitlements / subscription paywalls 
- Full browser XSS/CSP hardening (frontend ownership) 
- External pentest findings (see residual-risks.md if unavailable)

## Verification mapping (BE-610)

| Control family | Evidence |
| -------------- | -------- |
| Threat model | this document |
| Authorization matrix | `authorization-matrix.md` |
| Residual risks | `residual-risks.md` |
| Automated negatives | `test/integration/security_verification_test.go` + existing domain tests |
| SAST/deps/secrets/image | `scripts/security_scan.sh`, `scan-sla.md` |
