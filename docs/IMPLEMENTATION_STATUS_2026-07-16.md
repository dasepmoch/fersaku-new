# Implementation status — target 9/10

Tanggal: 16 Juli 2026
Baseline audit: **6,5/10**
Current engineering score: **9,0/10 untuk scope frontend mock-first**

Refactor engineering mempertahankan layout, warna, typography, responsive behavior, dan pola interaksi existing. Perubahan konten admin hanya pada penyederhanaan scope yang diminta: Admin AI, Security Audit, Risk Operations, Dispute & Refund, dan Reconciliation dihapus tanpa mendesain ulang UI.

## Yang sudah dikerjakan

- [x] Route manifest + smoke characterization untuk 78 route aktif, desktop dan mobile (`156 passed`).
- [x] Critical browser flows: checkout/QRIS, storefront undo-redo, pagination, seller withdrawal dengan verified Xendit quote, theme/notification/profile, admin confirmation, source/KYC/API controls, bounded impersonation + expiry, finance/callback controls, emergency/fulfillment controls, fee preview, callback retry queue, dan audit inspector (`22 passed`).
- [x] Visual regression baseline representative surfaces desktop/mobile (`28 passed` setelah route admin yang dihapus dikeluarkan dari baseline).
- [x] Accessibility smoke dengan axe pada 7 surface representative desktop/mobile (`14 passed`). Scan structural/keyboard/form strict; rule `color-contrast` dikecualikan karena palette editorial existing merupakan keputusan UI yang tidak boleh berubah pada scope ini.
- [x] CI reproducibility: Node/npm pin, `npm ci`, format, lint zero-warning, typecheck, coverage, build, E2E artifacts, concurrency cancellation.
- [x] Shared mock runtime deterministic: scenario, clock, ID, latency abort, reset, versioned Zod storage.
- [x] Feature data boundaries untuk catalog, orders, finance, buyer, seller, checkout, admin, public storefront, dan reviews. Presentation tidak lagi mengimpor fixture `lib/*mock-data` langsung.
- [x] Canonical React Query keys untuk seller, buyer, dan admin; invalidation policy untuk mutation.
- [x] Source-neutral mutation seams untuk checkout, storefront publish, product release, buyer session revoke, review moderation, dan admin actions; sensitive admin metadata (reason/idempotency/MFA) typed.
- [x] HTTP hardening: timeout/caller abort distinction, request ID, safe mutation headers, typed errors, JSON/envelope schema validation, dan production API URL guard.
- [x] Security headers di Next config, mock/live environment mismatch guard, `.env.example`, dan frontend session/permission view contracts.
- [x] Error reporter no-op dengan recursive redaction, React Query global error hooks, dan route error-boundary reporting.
- [x] Dead compatibility shells/unreachable source dihapus setelah import graph diverifikasi; money/status/pagination primitives dikonsolidasikan.
- [x] Backend handoff untuk auth/session, errors, correlation, idempotency, MFA, permissions, money, payment, ledger, fulfillment, KYC, audit, dan cursor pagination.
- [x] Task specification backend production lengkap untuk Go modular monolith, Docker, PostgreSQL, Redis, Cloudflare R2, Xendit, security, observability, CI/CD, testing, runbook, dan phased acceptance (`BACKEND_PRODUCTION_TASKS.md`).
- [x] Admin scope disederhanakan untuk model satu provider Xendit: tanpa Admin AI, risk engine, security-audit console, refund/dispute, atau reconciliation console.
- [x] Delapan operasi admin ringan selesai dalam mock: source tag/filter, KYC queue age/reason, failed-callback retry, suspend Storefront/API terpisah, global fee preview, paid/pending mismatch, append-only audit explorer, dan provider health/emergency switches.
- [x] Impersonation admin dibatasi dengan reason, TTL, read-only default, support-write scope, validated session storage, visible banner, expiry, end-session cleanup, dan audit event; full-access tidak disediakan.
- [x] Kontrak bisnis frontend dikoreksi tanpa redesign: semua fitur gratis, transaksi berhasil `3% + Rp700`, withdrawal `3% + biaya proses` minimum Rp50.000, API murni independent QRIS payment gateway, live API setelah KYC, dan saldo Storefront/QRIS API tetap satu wallet dengan source attribution.
- [x] Seller withdrawal tidak lagi dead-end: CTA saldo/riwayat menuju form, lock kedaluwarsa tidak memblokir, biaya provider wajib berasal dari typed `POST` quote, submit memerlukan reauthentication, mock history tersimpan berversi, dan source allocation Storefront/QRIS API/MIXED tetap terlihat.
- [x] Guardrail privileged flow ditutup: KYC memakai state machine + reviewer reason + recent MFA; inventory list tidak membawa raw secret; reveal terpisah, beralasan, recent-MFA, dan otomatis kedaluwarsa; callback force-fulfill wajib evidence-bound serta tidak boleh menulis payment/ledger.
- [x] Role/system/profile admin di-hardening tanpa redesign: system role/config read-only, custom role + invite memakai shared versioned store, Super Admin MFA tidak bisa dimatikan, recovery-code generation ditahan sampai backend aman, dan revoke session memerlukan recent MFA.

## Bukti quality gate

Perintah berikut hijau pada workspace ini:

```text
npm run format:check
npm run lint -- --max-warnings=0
npm run typecheck
npm run test:run                 # 89 tests / 17 files
npm run test:coverage            # 95.69% stmts; 92.53% branches; 100% funcs; 96.20% lines
npm run build                    # 64 generated pages
npx playwright test tests/e2e/smoke.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/critical-flows.spec.ts
                                    # 192 passed: 156 smoke + 14 a11y + 22 critical
npm run test:e2e:visual          # 28 passed
npm run check:bundle             # 152 chunks / 2,404,345 bytes / max 369,501 bytes
npm audit --omit=dev --audit-level=high
```

Full Playwright suite: **220/220 passed** (`192` nonvisual + `28` visual), semuanya dijalankan pada desktop dan mobile Chromium. Production build menghasilkan **64 halaman**. Bundle berisi **152 JavaScript chunks**, total **2.404.345 bytes** (sekitar 2,40 MB), dan chunk terbesar **369.501 bytes** (sekitar 370 KB); seluruhnya masih di bawah budget repository.

Angka coverage di atas adalah coverage terkonfigurasi untuk critical core helpers (`shared/api/http-client.ts` dan `shared/ui/pagination.ts`), bukan klaim coverage seluruh JSX aplikasi. Behavior lintas-surface dijaga oleh 220 browser checks, sedangkan domain/security helper tambahan dijaga oleh 89 unit tests.

`npm audit` tetap melaporkan dua advisory **moderate** dari PostCSS transitif Next. Tidak ada high/critical production advisory; `npm audit fix --force` sengaja tidak dijalankan karena menyarankan perubahan Next yang breaking.

## Accepted debt yang tetap backend/produk-owned

1. Auth, authorization final, payment provider callback, ledger, balance, KYC, fulfillment, provider secret, dan audit immutability belum bisa diproduksikan di frontend-only repository ini.
2. Contrast editorial existing belum diubah demi menjaga tampilan; ditrack terpisah dari structural accessibility guardrail.
3. Cursor pagination dan OpenAPI generated types akan menggantikan page/mock DTO saat Go API siap.
4. Bundle regression sudah dibatasi secara lokal/CI; Real User Monitoring dan Web Vitals berbasis deployment produksi tetap release follow-up, bukan alasan untuk mengubah UI prototype sekarang.

> Roadmap detail tetap ada di [`TASKS_TO_9.md`](TASKS_TO_9.md); dokumen ini mencatat hasil eksekusi snapshot ini.
