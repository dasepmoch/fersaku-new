# UI-050 — Existing lifecycle-state mapping

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-050  
**Disposition machine:** `TASK/10-ROUTE-AND-CONTROL-DISPOSITION.md` §2–3  
**Component registry:** `TASK/evidence/UI-030/component-reuse-registry.md`

Wiring binds network states to **existing** surfaces only. Missing composition → block flag or `UI-080` (see UXE rows), never invent panels.

## 1. Global / shared surfaces

| Lifecycle state | Existing surface | Path | Notes |
| --- | --- | --- | --- |
| Unexpected 5xx / uncaught | `GlobalError` | `app/error.tsx` | Last resort; not for validation/empty/permission |
| Declared resource 404 | `NotFound` | `app/not-found.tsx` | Also safe-404 for enumeration-sensitive resources |
| Root layout shell | Root layout | `app/layout.tsx` | Do not add root skeleton for marketing |

## 2. Seller workspace

| Lifecycle state | Existing surface | Path |
| --- | --- | --- |
| Initial loading | Workspace skeleton grid | `app/dashboard/(workspace)/loading.tsx` |
| Route error / retry GET | Workspace error + “Coba lagi” | `app/dashboard/(workspace)/error.tsx` |
| Shell / nav | `DashboardShell`, `SellerDashboardFrame` | `features/seller/components/*` |
| Inline status | `Status` (seller pieces), `StatusBadge` | `features/seller/ui/pieces.tsx`, `shared/ui/status-badge.tsx` |
| Form field errors | Existing `FormGroup` / `Input` / field regions on screen | seller screens + `shared/ui/form-controls.tsx` |
| Mutation pending | Disable existing CTA; `aria-busy` if already patterned | per-screen buttons |
| Onboarding (outside workspace boundary) | `StoreOnboarding` form state; unexpected → `GlobalError` | `features/seller/onboarding/store-onboarding.tsx` — see UXE-008 |

## 3. Admin console

| Lifecycle state | Existing surface | Path |
| --- | --- | --- |
| Initial loading | Console loading | `app/admin/(console)/loading.tsx` |
| Route error / retry | Console error | `app/admin/(console)/error.tsx` |
| Forbidden (403) | `AdminPermissionBoundary` | `features/admin/components/admin-permission-boundary.tsx` |
| Command confirm / reason | `ControlDialog` | `features/admin/ui/dialogs.tsx` |
| Status / risk | `AdminStatus`, `RiskBadge` | `features/admin/ui/status.tsx` |
| Shell / login geometry | `AdminShell`, `AdminLogin` | `features/admin/components/admin-shell.tsx` |
| Form controls | `AdminInput`, `Toggle`, `SettingsGroup` | `features/admin/ui/forms.tsx` |

## 4. Buyer account

| Lifecycle state | Existing surface | Path |
| --- | --- | --- |
| Shell | `BuyerShell` | `features/buyer/components/buyer-shell.tsx` |
| List/detail cards | `PurchaseLibrary`, `PurchaseDetail`, pieces | `features/buyer/screens/*` |
| Profile/security forms | `BuyerProfile`, `BuyerSecurity`, `ProfileField` | buyer screens |
| Route loading/error | **None at route level** | Use shell + keep previous data on refetch; gaps → UXE-002 |
| Login | `BuyerLogin` (loading/sent only) | `components/buyer-login.tsx` |
| Verify | Static success page geometry | `app/account/verify/page.tsx` — negative → NotFound / UXE-011 |

## 5. Auth (seller/admin)

| Lifecycle state | Existing surface | Path |
| --- | --- | --- |
| Shell | `AuthShell` | `components/auth-shell.tsx` |
| Field error / submit loading | `AuthForm` | `components/auth-form.tsx` |
| Admin login snapshot | `AdminLogin` static link/defaults | `features/admin/components/admin-shell.tsx` — API blocked until UXE-011 |
| MFA / rate-limit / unavailable | **No complete generic panel** | UXE-011 / UI-080 — do not invent |

## 6. Checkout

| Lifecycle state | Existing surface | Path |
| --- | --- | --- |
| Details / QR / paid | `CheckoutDetailsStep`, `CheckoutQrisStep`, `CheckoutPaidStep`, `CheckoutOrderSummary` | `features/commerce/checkout/*` |
| Field pieces | `Field` | `features/commerce/checkout/pieces.tsx` |
| Conflict/expired/unavailable | Prefer inline existing step regions | Missing → UXE-003; **never map to paid** |
| Unexpected | `GlobalError` | `app/error.tsx` |

## 7. Public / marketing

| Lifecycle state | Existing surface | Path |
| --- | --- | --- |
| Static pages | Marketing shell / content page | `components/marketing-shell.tsx`, `content-page.tsx` |
| Server read failure | Prefer not inventing public error card; unexpected → `GlobalError` | `app/error.tsx` |
| Empty featured/store arrays | **No empty composition** | UXE-009 / launch invariant |

## 8. HTTP → existing UI (canonical)

| HTTP / app state | Map to | Do not |
| --- | --- | --- |
| Initial loading | Surface loading/skeleton above | Full-page spinner where none exists |
| Background refresh | Keep previous data | Replace whole screen with skeleton |
| Empty collection | Existing empty composition **if any**; else launch invariant / UI-080 | Fake rows / demo fixtures in API |
| 400 VALIDATION_FAILED | Existing field error regions | New error layout |
| 401 | Clear private cache → existing login route + safe `returnTo` | Stale private data |
| 403 | Admin: `AdminPermissionBoundary`; buyer/seller: safe-404 or UXE/UI-080 | Silent “login redirect” as 403 |
| 404 | `notFound()` / `app/not-found.tsx` | Treat filter-empty as 404 |
| 409 | Preserve form; existing dialog/inline; reconcile before resubmit | Silent overwrite |
| 429 | Existing error/disable; honor `Retry-After` | Retry loops |
| 5xx / network | Cached safe data + existing error; **no mock fallback** | Fake success |
| Mutation pending | Disable existing CTA; prevent double-submit | Optimistic money/secret |
| Mutation success | Existing success only after authoritative response | Local timer success |
| Mutation unknown | Stay non-success; reconcile then retry | Assume paid/completed |
| INVALID_API_CONTRACT | Fail closed + existing error | TypeScript cast defaults |

## 9. Surface matrix (summary)

| Surface | Loading | Error/retry | Access / not-found |
| --- | --- | --- | --- |
| Root/public | Server render; no extra skeleton | `app/error.tsx` | `app/not-found.tsx` |
| Auth | AuthShell/AuthForm/BuyerLogin/AdminLogin geometry | Field/loading only; gaps UXE-011 | Login redirect / safe NotFound |
| Checkout | Checkout steps | Inline / GlobalError | NotFound for invalid capability |
| Buyer | BuyerShell / cards | GlobalError unexpected; UXE-002 | Login / NotFound |
| Seller workspace | `dashboard/(workspace)/loading.tsx` | `dashboard/(workspace)/error.tsx` | Login/onboarding / safe NotFound |
| Admin | `admin/(console)/loading.tsx` | `admin/(console)/error.tsx` + ControlDialog | AdminPermissionBoundary / NotFound |

## 10. Agent rule

If the table says “none” or points to UXE-*: **stop and record disposition**. Do not add `loading.tsx`/`error.tsx`/banners in a wiring PR without UI-080.
