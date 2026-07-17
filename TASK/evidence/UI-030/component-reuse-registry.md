# UI-030 — Exact component reuse registry

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-030  
**Rule:** Import and reuse. Never copy-paste markup/class into a “live” twin. Never create a new component when one below exists.

Inventory method: contract list + `find`/`rg` of `shared/ui`, `components`, `features/*/components`, `features/*/ui`, plus checkout/onboarding presentation used by routes.

---

## 1. Cross-surface (`shared/ui`)

| Path | Export / purpose | Surfaces |
| --- | --- | --- |
| `shared/ui/form-controls.tsx` | `FormGroup`, `FieldInput` — labeled form density | Seller settings/forms, shared form patterns |
| `shared/ui/status-badge.tsx` | `StatusBadge` — status chip | Cross-domain status display |
| `shared/ui/table-pagination.tsx` | `TablePagination` — numbered page UI | Screens that already render it (e.g. seller orders) |
| `shared/ui/use-client-pagination.ts` | Client pagination helper | Presentation that already uses local paging |
| `shared/ui/pagination.ts` | Pagination utilities | Shared with table pagination |
| `shared/ui/section-head.tsx` | `SectionHead` — section heading pattern | Dashboard/admin section headers |
| `shared/ui/mini-stat.tsx` | `MiniStat` — compact metric | Seller overview (also re-exported from seller pieces) |
| `shared/ui/notification-center.tsx` | `NotificationCenter` — notification shell | Seller/admin/buyer chrome |
| `shared/ui/profile-menu.tsx` | `ProfileMenu` — profile/session menu | Seller/admin/buyer chrome |
| `shared/ui/account-controls.tsx` | Re-exports notification + profile | Shell composition |
| `shared/ui/account-controls-data.ts` | Control data shapes | Shell data binding only |
| `shared/ui/styles.ts` | `surfaceCard`, `surfaceCardPad`, `statusTone` | Card tokens; import, don’t redefine |

---

## 2. Cross-surface (`components/`)

| Path | Export / purpose | Surfaces |
| --- | --- | --- |
| `components/auth-shell.tsx` | `AuthShell` | `/login`, `/register` |
| `components/auth-form.tsx` | `AuthForm` | Seller login/register fields/loading |
| `components/buyer-login.tsx` | `BuyerLogin` | `/account/login` magic-link |
| `components/invoice-view.tsx` | `InvoiceView` | Invoice routes |
| `components/mock-interaction-boundary.tsx` | Prototype interaction boundary | **Mode-gate**; never show mock feedback in API mode |
| `components/marketing-shell.tsx` | Marketing page chrome | Public marketing |
| `components/public-nav.tsx` | Public navigation | Marketing/storefront headers |
| `components/footer.tsx` | Site footer | Marketing |
| `components/brand.tsx` / `logo-mark.tsx` | Brand marks | Shells |
| `components/content-page.tsx` | Static content layout | Legal/help-style pages |
| `components/product-art.tsx` | Product illustration | Catalog/product cards |
| `components/landing-previews.tsx` | Landing preview blocks | Home |
| `components/revenue-chart.tsx` | Chart presentation | Seller analytics |
| `components/rotating-quote.tsx` | Quote rotator | Marketing |
| `components/api-playground.tsx` | API playground UI | Docs/API surfaces |
| `components/theme-provider.tsx` | Theme context | Root |

**Also visual-risk auth (contract):**  
`features/admin/components/admin-shell.tsx` (`AdminLogin`), `app/account/verify/page.tsx` — static/mock at snapshot; no new form/error panel in wiring.

---

## 3. Seller

| Path | Export / purpose | Surfaces |
| --- | --- | --- |
| `features/seller/components/dashboard-shell.tsx` | `DashboardShell` | Seller workspace chrome/nav |
| `features/seller/components/seller-dashboard-frame.tsx` | `SellerDashboardFrame` | Workspace frame |
| `features/seller/components/traffic-analytics.tsx` | `TrafficAnalytics` | Overview traffic |
| `features/seller/ui/pieces.tsx` | `SearchBox`, `FilterButton`, `Status`, `FormGroup`, `Input`, `Select`, `sellerCard`, re-export `MiniStat` | Seller screens — **import directly** |
| `features/seller/onboarding/store-onboarding.tsx` | `StoreOnboarding` | `/dashboard/onboarding` |
| `features/seller/storefront/**` | Builder/preview/panels/controls | `/dashboard/storefront` |
| `features/seller/screens/**` | Product/order/inventory/finance/… screens | Matching `/dashboard/*` routes |
| `app/dashboard/(workspace)/loading.tsx` | Seller route loading skeleton | Workspace routes |
| `app/dashboard/(workspace)/error.tsx` | Seller error/retry | Workspace routes |

---

## 4. Buyer

| Path | Export / purpose | Surfaces |
| --- | --- | --- |
| `features/buyer/components/buyer-shell.tsx` | `BuyerShell` | Account shell/nav |
| `features/buyer/screens/purchase-library.tsx` | `PurchaseLibrary` | `/account/purchases` |
| `features/buyer/screens/purchase-detail.tsx` | `PurchaseDetail` | Purchase detail |
| `features/buyer/screens/buyer-profile.tsx` | `BuyerProfile` | `/account/profile` |
| `features/buyer/screens/buyer-security.tsx` | `BuyerSecurity` | `/account/security` |
| `features/buyer/screens/pieces.tsx` | `BuyerReviewCard`, `ProfileField`, `Preference` | Buyer composition |
| `components/buyer-login.tsx` | Login | `/account/login` |
| `components/invoice-view.tsx` | Invoice | Account/order invoice |

---

## 5. Admin

| Path | Export / purpose | Surfaces |
| --- | --- | --- |
| `features/admin/ui/admin-button.tsx` | `AdminButton` | Admin CTAs |
| `features/admin/ui/dialogs.tsx` | `ControlDialog` (guarded confirmation) | Privileged commands |
| `features/admin/ui/forms.tsx` | `SettingsGroup`, `AdminInput`, `Toggle` | Admin forms |
| `features/admin/ui/layout.tsx` | `PanelHead`, `Metric`, `SearchInput`, `SelectButton`, `TableToolbar`, `TableHeader` | Admin lists/panels |
| `features/admin/ui/chrome.tsx` | Re-exports chrome/forms/dialogs/status | Preferred import barrel |
| `features/admin/ui/status.tsx` | `AdminStatus`, `RiskBadge`, `Info` | Status/risk |
| `features/admin/ui/transaction-source.tsx` | Source badge/filter | Payments |
| `features/admin/ui/styles.ts` | `adminPanel`, button classes | Admin tokens |
| `features/admin/components/admin-shell.tsx` | `AdminShell`, `AdminLogin` | Console + login |
| `features/admin/components/admin-console-frame.tsx` | `AdminConsoleFrame` | Console frame |
| `features/admin/components/admin-permission-boundary.tsx` | `AdminPermissionBoundary` | **403 surface** |
| `features/admin/screens/**` | Domain screens | `/admin/*` |
| `features/admin/operations/**` | KYC/webhooks/emergency UIs | Ops routes |
| `features/admin/commerce/**` | Campaigns/fees UIs | Campaign routes |
| `app/admin/(console)/loading.tsx` | Admin loading | Console routes |
| `app/admin/(console)/error.tsx` | Admin error/retry | Console routes |

---

## 6. Checkout / commerce presentation

| Path | Export / purpose | Surfaces |
| --- | --- | --- |
| `features/commerce/checkout/checkout-experience.tsx` | `CheckoutExperience` | `/checkout/[checkoutId]` |
| `features/commerce/checkout/details-step.tsx` | `CheckoutDetailsStep` | Details step |
| `features/commerce/checkout/qris-step.tsx` | `CheckoutQrisStep`, `CheckoutPaidStep` | QR / paid |
| `features/commerce/checkout/order-summary.tsx` | `CheckoutOrderSummary` | Summary |
| `features/commerce/checkout/pieces.tsx` | `Field`, wallet constants | Checkout fields |

---

## 7. Global lifecycle shells

| Path | Purpose |
| --- | --- |
| `app/error.tsx` | `GlobalError` — last-resort unexpected |
| `app/not-found.tsx` | `NotFound` — declared 404 |
| `app/layout.tsx` | Root layout (do not redesign) |

---

## 8. Reuse procedure (mandatory)

1. Search registry + `rg` in `shared/ui`, `components`, `features/**/ui`, `features/**/components`, `features/**/screens`.
2. Prefer barrel imports already used by the screen (`features/admin/ui`, `features/seller/ui`).
3. If no component exists: **do not create one in a wiring PR** — map in adapter, disable control, or open `UI-080`.
4. Do not duplicate seller `Status` vs `StatusBadge` patterns across domains with new variants.

## 9. Anti-patterns

```tsx
// Forbidden
return isLiveApi() ? <NewLiveTable /> : <ExistingTable />;

// Required
const view = mapDto(dto);
return <ExistingTable {...toExistingProps(view)} />;
```
