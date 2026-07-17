# UI-070 — Visual-risk file register

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-070
**Rule:** Any diff in these paths is visual-risk even if small. Prefer wiring in api/hooks/mappers/shared/api/backend.
**Captured:** 2026-07-17 · base `76e0456fee72a60946f7802859a44a9dd91b739c`

## 1. App Router surfaces

```text
app/account/login/page.tsx
app/account/page.tsx
app/account/profile/page.tsx
app/account/purchases/[orderId]/invoice/page.tsx
app/account/purchases/[orderId]/page.tsx
app/account/purchases/page.tsx
app/account/security/page.tsx
app/account/verify/page.tsx
app/admin/(console)/audit-logs/page.tsx
app/admin/(console)/buyers/[buyerId]/page.tsx
app/admin/(console)/buyers/page.tsx
app/admin/(console)/campaigns/page.tsx
app/admin/(console)/error.tsx
app/admin/(console)/fulfillment/page.tsx
app/admin/(console)/inventory/page.tsx
app/admin/(console)/kyc/page.tsx
app/admin/(console)/layout.tsx
app/admin/(console)/loading.tsx
app/admin/(console)/merchants/[merchantId]/page.tsx
app/admin/(console)/merchants/page.tsx
app/admin/(console)/orders/[orderId]/page.tsx
app/admin/(console)/orders/page.tsx
app/admin/(console)/page.tsx
app/admin/(console)/payments/page.tsx
app/admin/(console)/profile/page.tsx
app/admin/(console)/providers/page.tsx
app/admin/(console)/reviews/page.tsx
app/admin/(console)/roles/page.tsx
app/admin/(console)/roles/[roleId]/page.tsx
app/admin/(console)/system/page.tsx
app/admin/(console)/users/page.tsx
app/admin/(console)/webhooks/page.tsx
app/admin/(console)/withdrawals/page.tsx
app/admin/(console)/withdrawals/[withdrawalId]/page.tsx
app/admin/login/page.tsx
app/api/page.tsx
app/checkout/[checkoutId]/page.tsx
app/(company)/about/page.tsx
app/(company)/careers/page.tsx
app/(company)/contact/page.tsx
app/dashboard/onboarding/page.tsx
app/dashboard/(workspace)/api-keys/page.tsx
app/dashboard/(workspace)/balance/page.tsx
app/dashboard/(workspace)/coupons/new/page.tsx
app/dashboard/(workspace)/coupons/page.tsx
app/dashboard/(workspace)/customers/[customerId]/page.tsx
app/dashboard/(workspace)/customers/page.tsx
app/dashboard/(workspace)/error.tsx
app/dashboard/(workspace)/inventory/page.tsx
app/dashboard/(workspace)/inventory/[productId]/page.tsx
app/dashboard/(workspace)/layout.tsx
app/dashboard/(workspace)/loading.tsx
app/dashboard/(workspace)/orders/[orderId]/page.tsx
app/dashboard/(workspace)/orders/page.tsx
app/dashboard/(workspace)/page.tsx
app/dashboard/(workspace)/products/new/page.tsx
app/dashboard/(workspace)/products/page.tsx
app/dashboard/(workspace)/products/[productId]/page.tsx
app/dashboard/(workspace)/reviews/page.tsx
app/dashboard/(workspace)/settings/page.tsx
app/dashboard/(workspace)/storefront/page.tsx
app/dashboard/(workspace)/webhooks/page.tsx
app/dashboard/(workspace)/withdrawals/new/page.tsx
app/dashboard/(workspace)/withdrawals/page.tsx
app/docs/api/page.tsx
app/error.tsx
app/features/page.tsx
app/globals.css
app/invoices/verify/[token]/page.tsx
app/layout.tsx
app/(legal)/cookies/page.tsx
app/(legal)/privacy/page.tsx
app/(legal)/terms/page.tsx
app/login/page.tsx
app/not-found.tsx
app/orders/[orderId]/invoice/page.tsx
app/orders/[orderId]/[status]/page.tsx
app/page.tsx
app/pricing/page.tsx
app/register/page.tsx
app/(resources)/blog/page.tsx
app/(resources)/blog/[slug]/page.tsx
app/(resources)/changelog/page.tsx
app/(resources)/help/page.tsx
app/(resources)/security/page.tsx
app/(resources)/status/page.tsx
app/store/[storeSlug]/page.tsx
app/store/[storeSlug]/[productSlug]/page.tsx
```

## 2. Shared components

```text
components/api-playground.tsx
components/auth-form.tsx
components/auth-shell.tsx
components/brand.tsx
components/buyer-login.tsx
components/content-page.tsx
components/footer.tsx
components/invoice-view.tsx
components/landing-previews.tsx
components/logo-mark.tsx
components/marketing-shell.tsx
components/mock-interaction-boundary.tsx
components/product-art.tsx
components/public-nav.tsx
components/revenue-chart.tsx
components/rotating-quote.tsx
components/theme-provider.tsx
```

## 3. shared/ui

```text
shared/ui/account-controls-data.ts
shared/ui/account-controls.tsx
shared/ui/form-controls.tsx
shared/ui/mini-stat.tsx
shared/ui/notification-center.tsx
shared/ui/pagination.ts
shared/ui/profile-menu.tsx
shared/ui/section-head.tsx
shared/ui/status-badge.tsx
shared/ui/styles.ts
shared/ui/table-pagination.tsx
shared/ui/use-client-pagination.ts
```

## 4. Feature screens

```text
features/admin/screens/access/index.ts
features/admin/screens/access/profile.tsx
features/admin/screens/access/role-builder.tsx
features/admin/screens/access/roles.tsx
features/admin/screens/access.tsx
features/admin/screens/access/users.tsx
features/admin/screens/actions.tsx
features/admin/screens/buyers/detail.tsx
features/admin/screens/buyers/index.ts
features/admin/screens/buyers/list.tsx
features/admin/screens/buyers.tsx
features/admin/screens/fulfillment.tsx
features/admin/screens/inventory.tsx
features/admin/screens/merchants/access-dialog.tsx
features/admin/screens/merchants/detail.tsx
features/admin/screens/merchants/impersonation-dialog.tsx
features/admin/screens/merchants/index.ts
features/admin/screens/merchants/list.tsx
features/admin/screens/merchants/pieces.tsx
features/admin/screens/merchants.tsx
features/admin/screens/orders.tsx
features/admin/screens/overview.tsx
features/admin/screens/payments.tsx
features/admin/screens/reviews.tsx
features/admin/screens/system.tsx
features/admin/screens/withdrawals.tsx
features/buyer/screens/buyer-pages.tsx
features/buyer/screens/buyer-profile.tsx
features/buyer/screens/buyer-security.tsx
features/buyer/screens/pieces.tsx
features/buyer/screens/purchase-detail.tsx
features/buyer/screens/purchase-library.tsx
features/seller/screens/actions.tsx
features/seller/screens/api-keys.tsx
features/seller/screens/coupons.tsx
features/seller/screens/customers.tsx
features/seller/screens/finance/balance.tsx
features/seller/screens/finance/index.ts
features/seller/screens/finance.tsx
features/seller/screens/finance/withdrawal-form.tsx
features/seller/screens/finance/withdrawals.tsx
features/seller/screens/inventory/credential-format-tab.tsx
features/seller/screens/inventory/delivery-activity.tsx
features/seller/screens/inventory/detail.tsx
features/seller/screens/inventory/index.ts
features/seller/screens/inventory/list.tsx
features/seller/screens/inventory/pieces.tsx
features/seller/screens/inventory/stock-items-tab.tsx
features/seller/screens/inventory.tsx
features/seller/screens/orders.tsx
features/seller/screens/overview.tsx
features/seller/screens/products/detail.tsx
features/seller/screens/products/form.tsx
features/seller/screens/products/index.ts
features/seller/screens/products/list.tsx
features/seller/screens/products/pieces.tsx
features/seller/screens/products.tsx
features/seller/screens/reviews.tsx
```

## 5. Feature components

```text
features/admin/components/admin-console-frame.tsx
features/admin/components/admin-permission-boundary.tsx
features/admin/components/admin-shell.tsx
features/buyer/components/buyer-shell.tsx
features/seller/components/dashboard-shell.tsx
features/seller/components/seller-dashboard-frame.tsx
features/seller/components/traffic-analytics.tsx
```

## 6. Admin UI primitives

```text
features/admin/ui/admin-button.tsx
features/admin/ui/chrome.tsx
features/admin/ui/dialogs.tsx
features/admin/ui/forms.tsx
features/admin/ui/index.ts
features/admin/ui/layout.tsx
features/admin/ui/status.tsx
features/admin/ui/styles.ts
features/admin/ui/transaction-source.tsx
```

## 7. Seller UI + storefront + onboarding

```text
features/seller/onboarding/store-onboarding.tsx
features/seller/storefront/api.ts
features/seller/storefront/config.ts
features/seller/storefront/controls/color-control.tsx
features/seller/storefront/controls/control-area.tsx
features/seller/storefront/controls/control-input.tsx
features/seller/storefront/controls/option-grid.tsx
features/seller/storefront/controls/panel-title.tsx
features/seller/storefront/controls/select-control.tsx
features/seller/storefront/controls/toggle-row.tsx
features/seller/storefront/draft.ts
features/seller/storefront/history.ts
features/seller/storefront/index.ts
features/seller/storefront/mutations.ts
features/seller/storefront/panels/brand-panel.tsx
features/seller/storefront/panels/layout-panel.tsx
features/seller/storefront/panels/links-panel.tsx
features/seller/storefront/panels/sections-panel.tsx
features/seller/storefront/panels/template-panel.tsx
features/seller/storefront/preview/sections.tsx
features/seller/storefront/preview/store-preview.tsx
features/seller/storefront/storefront-builder.tsx
features/seller/storefront/types.ts
features/seller/ui/index.ts
features/seller/ui/pieces.tsx
```

## 8. Checkout presentation

```text
features/commerce/checkout/api.ts
features/commerce/checkout/checkout-experience.tsx
features/commerce/checkout/details-step.tsx
features/commerce/checkout/mutations.ts
features/commerce/checkout/order-summary.tsx
features/commerce/checkout/pieces.tsx
features/commerce/checkout/qris-step.tsx
```

## 9. Admin operations / commerce presentation (visual)

```text
features/admin/commerce/campaigns/announcements.tsx
features/admin/commerce/campaigns/index.tsx
features/admin/commerce/campaigns/pieces.tsx
features/admin/commerce/campaigns/preview.tsx
features/admin/commerce/campaigns.tsx
features/admin/commerce/fee-policy-preview.tsx
features/admin/commerce/merchant-fees.tsx
features/admin/domains/admin-extras.tsx
features/admin/domains/admin-providers.tsx
features/admin/domains/providers/generic-provider.tsx
features/admin/domains/providers/index.tsx
features/admin/operations/emergency/index.tsx
features/admin/operations/emergency/pieces.tsx
features/admin/operations/emergency.tsx
features/admin/operations/kyc/dialog.tsx
features/admin/operations/kyc/index.tsx
features/admin/operations/kyc/pieces.tsx
features/admin/operations/kyc.tsx
features/admin/operations/payment-mismatch.tsx
features/admin/operations/webhooks/force-fulfill-dialog.tsx
features/admin/operations/webhooks/index.tsx
features/admin/operations/webhooks/pieces.tsx
features/admin/operations/webhooks.tsx
```

## 10. Buyer feature presentation

```text
features/buyer/components/buyer-shell.tsx
features/buyer/screens/buyer-pages.tsx
features/buyer/screens/buyer-profile.tsx
features/buyer/screens/buyer-security.tsx
features/buyer/screens/pieces.tsx
features/buyer/screens/purchase-detail.tsx
features/buyer/screens/purchase-library.tsx
```

## 11. Style / tool config that affects pixels

```text
app/globals.css
next.config.ts
postcss.config.mjs
```

## 12. Screenshot baselines (never update in wiring)

```text
tests/e2e/__screenshots__/desktop-chromium/**
tests/e2e/__screenshots__/mobile-chromium/**
```

Counts (approx):
- desktop snapshots: 14
- mobile snapshots: 14

## 13. Preferred non-visual wiring paths (not visual-risk by default)

```text
features/**/api.ts
features/**/hooks.ts
features/**/schemas.ts
features/**/mappers.ts
features/**/transport.ts
features/**/mock.ts
features/**/data/**/*.ts
features/**/contracts.ts
shared/api/**
shared/query/**
shared/data/**
shared/auth/**
backend/**
```

## 14. Review rule

If a PR touches section 1–12: attach `git diff --stat`, list paths, and prove render identity (why class/geometry/copy unchanged). Touching section 12 with snapshot updates is an automatic freeze violation.
