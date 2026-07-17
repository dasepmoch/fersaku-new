# ADR-0004: Session, MFA, and impersonation policy

| Field  | Value      |
| ------ | ---------- |
| Status | Accepted   |
| Date   | 2026-07-16 |
| Task   | BE-000     |

## Context

Buyer, seller, and admin share cookie session transport. Frontend session models are view policy only; Go enforces every permission. Sensitive admin/seller actions need step-up MFA. Support impersonation exists in UI but must be tightly scoped, audited, and free of full privileged mode.

References: `docs/BACKEND_PRODUCTION_TASKS.md` §4.1 (sessions), §4.11, §5.1, §5.6, §6.5, §7.2, §11.1, §11.5, §10.4 retention, §15 BE-000, §16; `docs/BACKEND_HANDOFF.md`.

## Decision

### Sessions

1. Server-side opaque session cookie: `HttpOnly`, `Secure`, intentional `SameSite`, narrow path/domain. Token entropy ≥ 128-bit; DB stores hash only (never raw token).
2. Surfaces: `BUYER`, `SELLER`, `ADMIN` on `auth_sessions` with created/last-seen/expiry/revoked, MFA proof time, IP/UA hash, device label.
3. Rotate session at login, privilege change, MFA change, password reset, and impersonation start.
4. Absolute + idle expiry; logout/revoke invalidates server state. Password reset revokes sessions. Revoke-all commits before caller clears cookie.
5. Password hash: Argon2id with calibrated parameters and transparent rehash; constant-time verify; generic login/reset responses (no account enumeration).
6. CSRF protection for cookie-auth mutations. API-key gateway does not use browser cookie auth.
7. Bootstrap tokens (magic/reset/verify/invite/guest/invoice/secret-claim): URL fragment → typed POST-body exchange; hashed, purpose-bound, short-lived, atomic one-time; never path/query/referrer/logs; GET/email scanners cannot consume them (§6.5).

### MFA

1. Admin console requires MFA enrollment/verify. Sensitive seller/admin mutations may require recent MFA proof (`X-Recent-MFA-Proof`).
2. Recovery codes: hashed, one-time, shown once at create/regenerate, never fetchable later.
3. MFA disable and recovery regeneration require fresh MFA, audit, and security notification.

### Impersonation

1. Server-issued only via explicit `POST /v1/admin/users/{userId}/impersonation` (plus deterministic merchant-owner resolver). Requires `impersonation.start`, fresh MFA, reason/ticket, exact non-admin `target_user_id`, scope, TTL, idempotency.
2. Scopes only: `READ_ONLY` (default/max normal) and `SUPPORT_WRITE` (needs `impersonation.support_write`). **No** privileged/full scope in DB, Go, OpenAPI, client, or UI.
3. TTL choices: 15 / 30 / 60 minutes. Server enforces expiry; end/expiry immediately blocks derived session.
4. Derived session linked to original admin; never returns target cookie/token; never overwrites target real session. No nested or admin-to-admin impersonation.
5. Effective auth = target tenant/role permissions ∩ impersonation scope (admin permissions are not unioned in).
6. `SUPPORT_WRITE` launch allowlist only:
   - `PATCH /v1/buyer/profile` — `displayName`, `locale`, `timezone`
   - `PATCH /v1/stores/{storeId}` — `name`, `description` for stores the target already owns/manages
7. All other mutations default-deny. Banner data is server-session-backed.

### Retention owners (provisional launch defaults from §10.4)

| Data class | Online retention | Owner |
| ---------- | ---------------- | ----- |
| Auth/security event metadata | 1 year | Security |
| Revoked/expired session metadata | 90 days (token hash unusable immediately) | Security |
| Ledger/payment/withdrawal/immutable audit metadata | 7 years | Finance + Privacy |
| Encrypted Xendit raw callback evidence | 90 days | Payments |
| KYC document ciphertext | relationship end + 5 years | Compliance + Privacy |

Production sign-off requires owner approval or replacement of each duration; this ADR freezes the operational default until then.

## Consequences

- Session authority is always Postgres; Redis/cache cannot mint or validate auth truth alone.
- Impersonation abuse runbook and audit correlation (actor/target/session) are mandatory before production.
- Adding full-scope impersonation requires a new product/security ADR, migration, threat model, and release.

## References

- BACKEND_PRODUCTION_TASKS §4.1, §4.11, §5.1, §5.6, §6.5, §7.2, §10.4, §11.1, §11.5, §15 BE-000, §16 (Impersonation, Retention)
