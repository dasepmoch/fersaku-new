# QLT-320 — Observability, alerts, dashboards, runbooks (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-320 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-320`** | Observability **categories registered**, required non-empty samples (FE reporter/redaction, requestId propagation, BE metrics, runbook index, dashboards/SLO anchors), parent assert + CI suite `qlt-320-observability`, continuous co-evolution rule. **Not** every structured-signal / alert / runbook bullet or §3.7 cell. |
| **Capability cell** (`09` §3.7 column `QLT-320 observability`) | Domain-specific signals, alert wiring, dashboard panels, and runbook depth for that capability before canary. |

Parent must never wait on descendant cells. Domain tasks expand signals/alerts/runbooks in the **same PR** as observability-sensitive FE/BE/runtime changes.

**Do not invent** synthetic alert firings, game-day results, or production paging evidence. Those are cell/ops work when claimed.

## Categories (parent registration)

These four categories are the durable taxonomy. Parent harness only requires **at least one non-empty sample per required anchor** — not exhaustive coverage of every bullet in `07` §QLT-320.

| Category | Scope (examples; cells expand) | Parent sample anchors |
| --- | --- | --- |
| **Structured signals** | request ID, trace ID, release ID, route template/operation ID, surface, status/problem code, latency; actor/tenant only pseudonymous; payment/provider refs hashed/bounded; queue lag/retry/DLQ; callback rejection/dedupe; ledger/auth/permission denials; contract-invalid; dependency health from real adapters | `shared/observability/reporter.ts`, `shared/observability/redact.ts`, `shared/api/http-client.ts`, `shared/api/server-http-client.ts`, `backend/docs/observability-log-fields.md`, `backend/internal/platform/metrics/metrics.go`, `tests/unit/observability.test.ts`, `tests/unit/int-170-error-mock-observability.test.ts` |
| **Alerts** | paid callback not transitioning order; callback signature rejection / duplicate storm; provider unknown outcomes/latency; ledger/withdrawal anomaly; delivery/notification/webhook queue lag/DLQ; login/CSRF anomaly; cross-tenant/permission denial; contract invalid after deploy; error budget burn / readiness failure | Parent registers category + SLO alert taxonomy in `backend/docs/slo.md`. **Do not invent** alert firings. Domain cells own measured firings / canary proof when claimed. |
| **Dashboards** | HTTP rate/latency; payment paid; callback results; webhook delivery; outbox lag; audit chain — low-cardinality labels only | `backend/docs/dashboards/launch-overview.md`, `backend/docs/dashboards/launch-overview.json` |
| **Runbooks** | Xendit outage/unknown create/disbursement; callback backlog/replay; delivery/webhook DLQ; object scanner/storage; CSRF/session incident; credential/secret exposure; ledger/withdrawal containment; emergency switches; rollout rollback / migration | `backend/docs/runbooks/` index samples: `incident-diagnosis.md`, `callback-failure.md`, `queue-outbox.md`, `r2-email-health.md`, `backup-restore-integrity.md`, `sandbox-qris-synthetic.md` |

**Parent claim boundary:** registering categories + keeping sample files non-empty + CI guard green. Completing every row above for every capability is **§3.7 cell** work. Synthetic/canary proof that each critical alert reaches owner, and staging/game-day runbook exercise, remain cell/ops — **not** invented by parent.

## Continuous co-evolution rule (domain tasks)

When a domain task adds or changes HTTP/API surfaces, payments/callbacks, queues/outbox/webhooks, auth/CSRF, ledger/withdrawal, readiness/adapters, or FE transport error paths:

1. **Signals in the same PR** — emit structured fields with requestId/trace correlation; redact secrets/PII; prefer route templates and bounded labels over raw IDs/paths.
2. **Pick the category** — map the change to structured signals / alerts / dashboards / runbooks and document in evidence if non-obvious.
3. **FE unit** — prefer pure helpers (`tests/unit/*`): redaction, reporter context (releaseId/surface/operationId/requestId), transport error reporting without body dump.
4. **requestId propagation** — browser and SSR clients must attach and surface `X-Request-ID` / envelope `requestId` for operator correlation (INT-170 samples).
5. **BE metrics/logs** — low-cardinality Prometheus series via `platform/metrics`; log field conventions in `observability-log-fields.md`; never raw secrets in logs/metrics.
6. **Alerts/runbooks** — when claiming a capability cell, link alert → runbook URL and prove correlation path (UI → Go → DB/outbox/worker/provider) without raw secrets. **Never invent** firings or game-day results.
7. **CI** — keep `scripts/ci-assert-suite.mjs qlt-320-observability` green.
8. **Mark capability cell** in `09` §3.7 when domain observability depth is proven — leave parent alone.

## Harness locations

| Role | Path |
| --- | --- |
| Co-evolution rule (this doc) | `docs/QLT-320-OBSERVABILITY-COEVOLUTION.md` |
| Parent framework assert (unit/fs) | `tests/unit/qlt-320-parent-framework.test.ts` |
| FE reporter / redaction | `shared/observability/reporter.ts`, `shared/observability/redact.ts` |
| FE requestId / transport telemetry | `shared/api/http-client.ts`, `shared/api/server-http-client.ts` |
| FE unit samples | `tests/unit/observability.test.ts`, `tests/unit/int-170-error-mock-observability.test.ts` |
| BE log field conventions | `backend/docs/observability-log-fields.md` |
| BE metrics registry | `backend/internal/platform/metrics/metrics.go` |
| SLO / alert taxonomy | `backend/docs/slo.md` |
| Dashboards | `backend/docs/dashboards/launch-overview.md`, `launch-overview.json` |
| Runbook index | `backend/docs/runbooks/*` |
| Parent CI suite id | `scripts/ci-assert-suite.mjs` → `qlt-320-observability` |
| npm assert | `package.json` → `ci:assert:observability` |
| Frontend CI step | `.github/workflows/ci.yml` → `frontend-static` (assert suites) |

## Local / CI recipe (repeatable)

```bash
# Parent suite guards (no stack required)
node scripts/ci-assert-suite.mjs qlt-320-observability

# FE unit samples (observability-related)
./node_modules/.bin/vitest run \
 tests/unit/qlt-320-parent-framework.test.ts \
 tests/unit/observability.test.ts \
 tests/unit/int-170-error-mock-observability.test.ts
```

## Acceptance (parent only)

- Four categories (Structured signals, Alerts, Dashboards, Runbooks) are registered in this doc and enforced by parent assert + `qlt-320-observability` suite.
- Required samples remain non-empty and referenced: FE reporter/redaction, requestId propagation, BE metrics, runbook index (+ dashboard/SLO anchors).
- CI fails if parent samples or co-evolution doc regress (empty suite / missing markers).
- No invented alert firings or game-day results; domain observability co-evolves via §3.7 cells.
- Domain matrix cells in §3.7 remain separate work; parent `[x]` does **not** complete every signal/alert/runbook bullet in `07` §QLT-320.
