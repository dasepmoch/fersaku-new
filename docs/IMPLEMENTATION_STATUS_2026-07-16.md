# Implementation status — target 9/10

Tanggal: 16 Juli 2026
Baseline audit: **6,5/10**
Current engineering score: **9,0/10 untuk scope frontend mock-first**

Refactor ini mempertahankan UI, copy, layout, warna, typography, responsive behavior, dan hasil interaction default. Perubahan visual yang disengaja tidak dilakukan; screenshot yang sekarang disimpan sebagai characterization baseline.

## Yang sudah dikerjakan

- [x] Route manifest + smoke characterization untuk 82 route, desktop dan mobile (`164 passed`).
- [x] Critical browser flows: checkout/QRIS, storefront undo-redo, pagination, theme/notification/profile, dan admin confirmation (`10 passed`).
- [x] Visual regression baseline representative surfaces desktop/mobile (`30 passed` setelah baseline disetujui).
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

## Bukti quality gate

Perintah berikut hijau pada workspace ini:

```text
npm run format:check
npm run lint -- --max-warnings=0
npm run typecheck
npm run test:run                 # 61 tests
npm run test:coverage            # 95.69% statements, 92.53% branches
npm run build
npx playwright test tests/e2e/smoke.spec.ts --project=desktop-chromium --project=mobile-chromium
npx playwright test tests/e2e/critical-flows.spec.ts --project=desktop-chromium --project=mobile-chromium
npm run test:e2e:visual
npm run test:e2e:a11y
npm audit --omit=dev --audit-level=high
```

`npm audit` tetap melaporkan dua advisory **moderate** dari PostCSS transitif Next. Tidak ada high/critical production advisory; `npm audit fix --force` sengaja tidak dijalankan karena menyarankan perubahan Next yang breaking.

## Accepted debt yang tetap backend/produk-owned

1. Auth, authorization final, payment provider callback, ledger, balance, KYC, fulfillment, provider secret, dan audit immutability belum bisa diproduksikan di frontend-only repository ini.
2. Contrast editorial existing belum diubah demi menjaga tampilan; ditrack terpisah dari structural accessibility guardrail.
3. Cursor pagination dan OpenAPI generated types akan menggantikan page/mock DTO saat Go API siap.
4. Performance/bundle budget memerlukan baseline production deployment dan karena itu menjadi release follow-up, bukan alasan untuk mengubah UI prototype sekarang.

> Roadmap detail tetap ada di [`TASKS_TO_9.md`](TASKS_TO_9.md); dokumen ini mencatat hasil eksekusi snapshot ini.
