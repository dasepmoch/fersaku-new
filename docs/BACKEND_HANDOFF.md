# Fersaku frontend → Go backend handoff

Status: frontend contracts are mock-first and source-neutral. The Go service remains authoritative for identity, authorization, payment, ledger, fulfillment, KYC, provider credentials, and audit history.

The implementation-ready backlog, schema/state decisions, endpoint catalog,
Docker/runtime requirements, security tests, deployment gates, and runbooks are
defined in [`BACKEND_PRODUCTION_TASKS.md`](BACKEND_PRODUCTION_TASKS.md). That
document is authoritative when this short handoff omits detail.

## Transport envelope

Every JSON response should use one of these shapes:

```json
{ "data": {}, "meta": { "requestId": "req_01", "nextCursor": null } }
{ "problem": { "code": "ORDER_NOT_FOUND", "message": "Order not found", "requestId": "req_01", "details": {} } }
```

Frontend behavior:

- `requestId` is generated/forwarded as `X-Request-ID` and returned in errors.
- HTTP 2xx responses are parsed and validated at the feature boundary.
- Timeout, caller abort, network failure, non-JSON response, and invalid contract have distinct client error codes.
- GET may be retried by the query policy; sensitive mutations are not automatically retried.

## Identity and permissions

Use secure, httpOnly session cookies for buyer, seller, and admin sessions. The frontend `FrontendSession` model is a view policy only; Go must enforce every permission on every request. Admin actions should return an immutable audit event ID.

Required mutation context where applicable:

```txt
X-Request-ID       correlation ID
Idempotency-Key    unique operation key for payment/payout/fulfillment/admin actions
X-CSRF-Token       CSRF proof when cookie auth requires it
X-Recent-MFA-Proof recent step-up proof for sensitive admin/seller operations
X-Audit-Reason     human/operator reason, required for privileged actions
```

No bearer auth/bootstrap token, MFA proof, credential, QR payload, bank
account, or inventory secret belongs in a public environment variable,
localStorage, query cache, URL, or telemetry context. A deliberately issued
short-lived presigned non-KYC object URL is the narrow exception: treat the
entire URL as a secret capability and never persist, log, or forward it.

## Pagination and filtering

The prototype uses page pagination for deterministic tables. Production endpoints should return cursor metadata and stable ordering:

```json
{
  "data": [{ "id": "..." }],
  "meta": { "nextCursor": "opaque", "hasMore": true, "total": null }
}
```

The cursor is opaque to the client. Filters are tenant/store scoped, validated server-side, and included in the query key/cache identity.

## Domain invariants

- Every merchant completes onboarding with one canonical store, even when the
  store stays empty and the merchant only wants QRIS API access.
- QRIS API is an independent payment gateway only: create/status/cancel payment
  intents and signed webhooks. It never exposes product/catalog/upload/list APIs.
- Money is checked `int64` whole rupiah (IDR has zero fractional digits), never
  float/decimal JSON. Percentage uses one `round_half_up` rule; reject overflow,
  non-positive amount/net, negative fee, and fractional input.
- Successful storefront and QRIS API payments use the same global fee:
  `3% + Rp700`. Withdrawal is `3% + verified provider processing`, minimum
  `Rp50.000`; no merchant fee override or paid subscription tier exists.
- Payment state is provider-event driven and idempotent. The browser cannot mark an order paid.
- Ledger entries are append-only double-entry records. Storefront and QRIS API
  credit one merchant wallet while retaining source (`STOREFRONT`, `QRIS_API`,
  or mixed withdrawal allocation) for filters/reporting.
- Fulfillment and credential delivery require authorization, revocation, and audit checks. Secret inventory is encrypted at rest and returned only through an explicit reveal operation.
- Storefront revisions use optimistic concurrency (`revision`/ETag); publish conflicts return a typed conflict problem.
- Buyer invoice verification returns only privacy-safe public fields.
- KYC gates production QRIS API activation, not hosted storefront creation or sandbox usage.
- Xendit is the only payment/disbursement provider. There is no Duitku/failover,
  refund/dispute workflow, settlement-reconciliation console, admin risk engine,
  dedicated security-audit console, or Admin AI module.
- Seller/API access suspension are independent. Admin impersonation is
  server-issued, reason/MFA/TTL/audit bound, read-only by default, and has no
  full privileged scope.

## Production hardening invariants

- Callback ingress verifies bounded raw bytes first. Invalid auth/oversize/
  malformed envelopes go only to append-only `provider_callback_rejections`;
  they never enter the canonical/replay queue. Valid events dedupe on
  `(provider, account_scope, payment_mode, provider_event_id)` and resolve a
  payment/disbursement through a DB-enforced partial-unique full-tuple reference,
  never a provider reference alone.
- App roles cannot DML ledger tables. A controlled posting routine plus deferred
  commit constraint enforces immutable, positive whole-rupiah, balanced journals.
  Privileged mutations commit their derived audit event, domain rows,
  idempotency result, and outbox atomically or roll everything back.
- Withdrawal quote creation is idempotent `POST .../withdrawal-quotes` with
  explicit `bankAccountId`. Quote amount/net/history stay locked; equal/higher/
  lower actual provider fees use explicit balanced variance journals.
  `UNKNOWN_OUTCOME` keeps the reserve and resolves only by the same full provider
  reference; pending/unavailable/mismatch cannot release or resend funds.
- A verified provider reversal is an operational containment side-state and
  compensating journal against original settlement lots. It never rewrites
  `PAID`, invents a refund status, or adds refund/dispute UI/API.
- Seller API keys use request + owner/recent-MFA one-time claim; admin/support
  may authorize but never receive raw keys. API credentials own only API auth.
  Each webhook endpoint solely owns its envelope-encrypted signing secret and a
  separate one-time claim/rotation lifecycle.
- Gateway payment create accepts only optional active same-merchant/mode
  `webhookEndpointId`; it never accepts `webhookUrl`. Browser success/failure
  URLs are allowlisted and never fetched by Fersaku.
- KYC upload streams through authenticated server size/type validation,
  malware scan, and envelope encryption. Only ciphertext reaches private R2;
  KYC never uses a browser-to-R2 presigned URL.
- General R2 objects use globally unique create-only keys and conditional
  writes; replacement creates a new key. Do not assume R2 object versioning.
  Use approved Bucket Lock rules for immutable audit/evidence retention and
  keep backup/PITR as a separate control. A non-KYC presigned URL is itself a
  short-lived secret capability and may expose the provider path by design.
- Magic/reset/verify/invite/guest/invoice/secret-claim bootstrap tokens use a
  URL fragment then typed POST-body exchange. They are hashed, purpose-bound,
  short-lived, atomically one-time, removed before navigation, and never placed
  in path/query/referrer/logs; GET/email scanners cannot consume them.
- Payment, KYC, and withdrawal transition allowlists—including verified late
  provider-success exceptions—are explicit. Every unspecified/manual edge is
  rejected; no browser/admin arbitrary status writer exists.

## Endpoint map

The frontend feature APIs are the contract seam and can be connected without changing screens:

| Frontend domain       | Production responsibility                                    |
| --------------------- | ------------------------------------------------------------ |
| `features/catalog`    | public catalog, seller product CRUD/publish, reviews summary |
| `features/orders`     | buyer/seller order reads, fulfillment state                  |
| `features/finance`    | revenue, balance, withdrawal, settlement                     |
| `features/buyer`      | purchases, profile, sessions, delivery, invoice              |
| `features/admin/data` | privileged list/detail and audit-backed operations           |
| `features/commerce`   | checkout intent, QRIS provider lifecycle, delivery handoff   |
| QRIS gateway surface  | merchant-scoped payment intents/events; never product CRUD   |

Each adapter must map transport DTOs to the existing domain contracts and preserve not-found/unauthorized/error semantics. Do not import fixture modules from presentation code.

## Operational checklist

- Keep API and frontend release IDs in error reports alongside request IDs.
- Redact PII and secrets before logs/telemetry; the default frontend reporter is a no-op.
- Run contract tests against OpenAPI fixtures before enabling `NEXT_PUBLIC_DATA_SOURCE=api`.
- Enable HSTS/CSP production policy only with the deployment's nonce/hash strategy verified.
- The current dependency audit has two moderate PostCSS/Next advisories and no high/critical production advisory; upgrade Next in a planned, reviewed change rather than `npm audit fix --force`.
