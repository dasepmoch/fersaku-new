# UI-000 baseline results summary

Date: 2026-07-17 ~11:43–11:48 WIB  
Base commit: `76e0456fee72a60946f7802859a44a9dd91b739c`  
Mode: mock (`NEXT_PUBLIC_DATA_SOURCE=mock`)  
Server: Fersaku on `http://127.0.0.1:3110` (not Canbot `:3100`)  
Config: `TASK/evidence/UI-000/playwright.baseline.config.ts`  
Snapshots: **not updated**

| Suite | Command | Passed | Failed | Skipped | Log |
| --- | --- | --- | --- | --- | --- |
| smoke | `playwright test tests/e2e/smoke.spec.ts` (desktop+mobile) | **156** | 0 | 0 | `../smoke.log` |
| a11y | `playwright test tests/e2e/accessibility.spec.ts` (desktop+mobile) | **14** | 0 | 0 | `../a11y.log` |
| visual | `playwright test tests/e2e/visual.spec.ts` (desktop+mobile) | **0** | **28** | 0 | `../visual.log` |

## Visual failures (baseline characterization only)

All 14 `visualRoutes` failed on **both** `desktop-chromium` and `mobile-chromium` (28 tests).

Typical diffs: ~0.01–0.03 of pixels (thousands of pixels, not full-page blank/wrong app).

**Label:** pre-existing / environment screenshot drift vs committed `__screenshots__` — **not** a wiring regression (no FE-BE wiring performed in UI-000).

**Action taken:** none; snapshots left unchanged per UI freeze.

Raw JSON report (text): `playwright-report.json`  
Pixel samples: `visual-summary.json`  
Large binary test-results (traces/videos/png) discarded after characterization to avoid multi-MB blobs.

## Smoke coverage

78 smoke routes × 2 projects = 156 tests — all green.

## A11y coverage

7 routes × 2 projects = 14 tests — all green (color-contrast rule disabled by suite design).
