# E2E-13 — Mock mode regression (separate)

| Field | Value |
|-------|--------|
| ID | E2E-13 |
| Priority | P2 |
| Type | Playwright mock config |
| Depends | — (use mock env, not live api stage) |

## Goal

Ensure dual-mode not broken: mock prototype still works for design/smoke.

## Steps

1. Run existing mock Playwright smoke against mock FE (port 3100 per `playwright.config.ts`) **or** temporary mock env
2. Critical flow: landing + one dashboard mock path
3. Do not point mock suite at production live stage

## Expected

- Mock smoke green or documented pre-existing failures only

## Evidence

`evidence/E2E-13/` + command output

## Note

This is **not** a substitute for E2E-05/06 live money path.
