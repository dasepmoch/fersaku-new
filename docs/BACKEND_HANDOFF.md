# Fersaku frontend → Go backend handoff

Status: frontend contracts are mock-first and source-neutral. The Go service remains authoritative for identity, authorization, payment, ledger, fulfillment, KYC, provider credentials, and audit history.

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

No token, MFA proof, credential, QR payload, bank account, or inventory secret belongs in a public environment variable, localStorage, query cache, URL, or telemetry context.

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

- Money is integer IDR minor units; never use floating point for payment or ledger values.
- Payment state is provider-event driven and idempotent. The browser cannot mark an order paid.
- Ledger entries are append-only double-entry records. Balance and payout availability are derived server-side.
- Fulfillment and credential delivery require authorization, revocation, and audit checks. Secret inventory is encrypted at rest and returned only through an explicit reveal operation.
- Storefront revisions use optimistic concurrency (`revision`/ETag); publish conflicts return a typed conflict problem.
- Buyer invoice verification returns only privacy-safe public fields.
- KYC gates production QRIS API activation, not hosted storefront creation or sandbox usage.

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

Each adapter must map transport DTOs to the existing domain contracts and preserve not-found/unauthorized/error semantics. Do not import fixture modules from presentation code.

## Operational checklist

- Keep API and frontend release IDs in error reports alongside request IDs.
- Redact PII and secrets before logs/telemetry; the default frontend reporter is a no-op.
- Run contract tests against OpenAPI fixtures before enabling `NEXT_PUBLIC_DATA_SOURCE=api`.
- Enable HSTS/CSP production policy only with the deployment's nonce/hash strategy verified.
- The current dependency audit has two moderate PostCSS/Next advisories and no high/critical production advisory; upgrade Next in a planned, reviewed change rather than `npm audit fix --force`.
