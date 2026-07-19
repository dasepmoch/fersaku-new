# Authorization matrix (BE-610)

**Source of truth:** `internal/domain/authz/permissions.go` + migration seeds 
(`000004_rbac`, `000005_roles_invites`, `000025_admin_reads`, `000026_admin_ops`). 
**Policy:** missing permission → `FORBIDDEN` (403); cross-tenant ID → `RESOURCE_NOT_FOUND` (404). 
**Impersonation:** effective permissions = target role/tenant ∩ scope; admin perms never unioned.

## Roles (system)

| Role | Code | Surface intent |
| ---- | ---- | -------------- |
| Super Admin | `SUPER_ADMIN` | All permission codes |
| Admin Support | `ADMIN_SUPPORT` | Ops: KYC, merchants, impersonation start, queues |
| Admin Finance | `ADMIN_FINANCE` | Withdrawals review, fees preview, finance reads |
| Seller Owner | `SELLER_OWNER` | Own merchant/store read+write |
| Buyer | `BUYER` | Own purchases read |
| Custom staff roles | (non-system) | Subset of registry; anti-escalation (BE-135) |

Merchant membership (`OWNER` / `STAFF`) scopes seller routes to that merchant; not a global role.

## Permission registry × system roles

Legend: **Y** = granted by seed; **—** = not granted; **\*** = SUPER_ADMIN has all.

| Permission | SUPER_ADMIN | ADMIN_SUPPORT | ADMIN_FINANCE | SELLER_OWNER | BUYER |
| ---------- | ----------- | ------------- | ------------- | ------------ | ----- |
| `admin.ping` | Y | Y | Y | — | — |
| `admin.dashboard.read` | Y | Y | Y† | — | — |
| `merchants.read` | Y | Y | Y | — | — |
| `merchants.write` | Y | — | — | — | — |
| `buyers.read` | Y | Y | — | — | — |
| `orders.read` | Y | Y | — | — | — |
| `payments.read` | Y | Y | Y† | — | — |
| `kyc.review` | Y | Y | — | — | — |
| `withdrawals.review` | Y | — | Y | — | — |
| `impersonation.start` | Y | Y | — | — | — |
| `impersonation.support_write` | Y | —‡ | — | — | — |
| `provider_callbacks.replay` | Y | Y | — | — | — |
| `seller_webhook_deliveries.retry` | Y | Y | — | — | — |
| `webhooks.read` | Y | Y | — | — | — |
| `roles.read` | Y | Y | — | — | — |
| `roles.write` | Y | — | — | — | — |
| `roles.assign` | Y | — | — | — | — |
| `users.read` | Y | Y | — | — | — |
| `fulfillment.force` | Y | Y | — | — | — |
| `fulfillment.read` | Y | Y | — | — | — |
| `inventory.reveal` | Y | Y | — | — | — |
| `inventory.read` | Y | Y | — | — | — |
| `reviews.read` | Y | Y | — | — | — |
| `reviews.moderate` | Y | —§ | — | — | — |
| `campaigns.publish` | Y | — | — | — | — |
| `platform.emergency` | Y | — | — | — | — |
| `platform.fees.preview` | Y | — | Y | — | — |
| `audit.read` | Y | Y | Y | — | — |
| `seller.store.read` | Y | — | — | Y | — |
| `seller.store.write` | Y | — | — | Y | — |
| `buyer.purchases.read` | Y | — | — | — | Y |
| `invitations.staff` | Y | — | — | — | — |
| `invitations.merchant` | Y | — | — | Y¶ | — |

† Finance read grants follow `000025_admin_reads` (finance-oriented subset). 
‡ `impersonation.support_write` is SUPER_ADMIN (and custom roles with explicit grant) only by default seed. 
§ `reviews.moderate` seeded for SUPER_ADMIN; support may gain via custom role. 
¶ Merchant invites are seller-owned flows where product grants apply.

## Resource access patterns

| Resource | Who | Authn | Authz rule | Cross-tenant |
| -------- | --- | ----- | ---------- | ------------ |
| Own session/profile | Authenticated user | Cookie session | Self only | N/A |
| Seller store/products/inventory | Seller member | Cookie | Membership + `seller.store.*` | 404 |
| Seller finance/withdrawals | Seller member | Cookie | Membership + store scope | 404 |
| Hosted checkout create | Public / buyer | Optional session | Published catalog only | N/A |
| QRIS gateway payments | Merchant | API key | Key active + mode capability | Opaque 401/404 |
| KYC cases | Seller owner/member | Cookie | Merchant resolve | 404 |
| KYC admin review | Admin | Cookie session | `kyc.review` | N/A (admin) |
| Credential list/claim | Seller | Cookie | Merchant resolve; raw never in list | 404 |
| Seller webhooks | Seller | Cookie | Store scope + SSRF URL policy | 404 |
| Admin reads | Admin | Cookie | Specific `*.read` perms | Unscoped list needs `merchants.read` |
| Admin mutations (8 ops) | Admin | Cookie | Permission + reason + audit | N/A |
| Impersonation start | Admin | Cookie session | `impersonation.start` (+ support_write for scope) | Target user required |
| Impersonation mutations | Derived session | Cookie | Target ∩ SUPPORT_WRITE allowlist (2 routes) | Default deny |
| Inbound Xendit webhook | Provider | Shared secret | Signature/token; no session | N/A |
| Public storefront / invoice verify | Public | None / token | Safe fields only | N/A |

## Impersonation scopes

| Scope | Reads | Mutations |
| ----- | ----- | --------- |
| `READ_ONLY` | Target-visible reads | **None** (default deny) |
| `SUPPORT_WRITE` | Target-visible reads | Only: `PATCH /v1/buyer/profile` (displayName, locale, timezone); `PATCH /v1/stores/{storeId}` (name, description) |
| `PRIVILEGED` / `FULL` | — | **Rejected** (not in schema/API) |

## Gateway vs cookie

| Mechanism | CSRF | Session | Tenant |
| --------- | ---- | ------- | ------ |
| Browser cookie | Required on unsafe methods | Opaque hashed session | RBAC + membership |
| Merchant API key | N/A | N/A | Key → merchant_id + payment mode |

## Verification

- Integration: `rbac_test`, `admin_reads_test`, `admin_ops_test`, `impersonation_test`, `security_verification_test` 
- Unit: `domain/admin/impersonation_allowlist_test`, `domain/authz/*_test`
