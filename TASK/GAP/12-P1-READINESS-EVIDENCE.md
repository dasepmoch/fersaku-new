# P1 — Reconcile readiness board dan lengkapi staging/canary evidence

## Bukti temuan

- `TASK/PROD/13-KEYSWAP-STATUS.md` menyatakan pre-live NOT READY: staging parity, headed E2E, live canary, and owner operations remain pending.
- `TASK/PROD/09-EXECUTION-STATUS.md` dan `backend/docs/security/residual-risks.md` memiliki klaim “done/pass” yang bertentangan dengan test failures, scanner absence, stale image/callback 404 evidence, dan managed infra pending.
- `TASK/PROD/evidence/KEY-51...` memilih launch subset dan secara eksplisit menunda full catalog/storefront/admin matrix.

## Scope

Jadikan readiness evidence truthful dan repeatable; jangan menutup gap hanya dengan mengedit status. Full deferred feature implementation tetap out of scope, tetapi domain yang akan diaktifkan harus punya acceptance evidence.

## Langkah implementasi

1. Buat satu matrix release keyed by commit/image digest dengan kolom owner, severity, prerequisite, command, result, timestamp UTC, expiry, and evidence link.
2. Re-run all P0 gates after fixes on clean checkout and disposable stack. Mark old evidence stale; jangan reuse host/demo output untuk claim production.
3. Staging parity: same artifact/config schema/route surface as production, provider sandbox mode explicit, scanner real/stub equivalent, LB trusted proxy, Redis, storage, mail, and worker topology.
4. Execute headed critical journeys for enabled domains: register/verify/login/MFA, seller onboarding/KYC, product upload/scan, storefront publish, QRIS pending/paid/expired/unknown, callback replay, delivery, withdrawal lifecycle, admin audit/impersonation guard.
5. Run canary with safe cohort/amount and rollback rehearsal. Record SLO/error budget, provider dashboard callback receipt, queue age, ledger reconciliation, and no-money-anomaly signoff.
6. Reconcile docs so “done” means evidence exists; keep human owner tasks clearly labelled OWNER/PENDING and block go-live on P0/P1 critical rows.

## Acceptance criteria

- One release candidate has a signed readiness matrix with no unresolved P0 and explicit approved P1 waivers (if any).
- Staging artifact digest equals candidate promoted to canary; all enabled-domain E2E pass without skip-only claims.
- Canary and rollback evidence is recent, sanitized, and points to actual runtime routes/images.
- Residual-risk document includes scanner, provider contract, proxy/rate-limit, observability, capacity, legal, supply-chain, and DR status.

