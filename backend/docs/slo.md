# Launch SLOs (BE-600)

Targets are **initial launch** indicators, not marketing promises. Staging load baselines and pool budgets are agreed in `backend/docs/performance/baseline.md` (BE-620). Do not invent 99.999% claims.

Environment: staging/production. `payment_mode` is independent of deployment `env` (ADR-0007).

## Service level objectives

| Capability | SLO | Indicator | Initial alert |
| ---------- | --- | --------- | ------------- |
| API availability | 99.5% successful non-5xx over 30d rolling (exclude client 4xx) | `fersaku_http_requests_total` by status; readiness failures | 5xx burn rate + `/health/ready` failing ≥2m |
| QRIS create (hosted + gateway) | p95 create latency &lt; 3s; error rate &lt; 2% over 1h | adapter latency + HTTP route latency for checkout/gateway create | error spike or p95 &gt; 5s for 10m |
| Payment finalization | p95 callback→local PAID &lt; 30s; mismatch age &lt; 15m | `fersaku_payment_paid_total`, callback processed, pending mismatch age | any provider-paid/local-pending older than 15m |
| Seller webhook delivery | &gt; 99% success within 15m of enqueue (excluding merchant endpoint 4xx) | `fersaku_webhook_delivery_total` | dead_letter &gt; 0 critical path or oldest retry age &gt; 30m |
| Outbox / critical jobs | oldest critical pending age &lt; 5m steady-state | `fersaku_outbox_oldest_age_seconds`, `fersaku_outbox_pending` | oldest age &gt; 10m or pending depth trend up 3 consecutive windows |
| Ledger integrity | unbalanced/orphan count = 0 | ledger rebuild/invariant jobs | any unbalanced result critical |
| Audit chain | integrity OK | `fersaku_audit_chain_status_total`, `fersaku_audit_chain_ok` | any `broken` critical |
| Withdrawal processing | no stuck UNKNOWN_OUTCOME &gt; 30m without operator note | withdrawal age metrics (ops) | age + duplicate invariant always critical |

## Error budget

- Availability 99.5% → ~3.6h downtime / 30 days.
- Prefer burn-rate alerts (fast + slow) over pure threshold spam.
- Financial/security failures are **never** sampled out of logs.

## Alert content (required)

Every page/ticket must include:

- runbook URL under `backend/docs/runbooks/`
- `request_id` and/or `trace_id` when request-scoped
- business-safe IDs only (`merchant_id`, `intent_id`, `callback_id`, …)
- never raw secrets/PII

## Dashboards

See `backend/docs/dashboards/` for Grafana-compatible panel definitions (markdown + JSON).

## Related

- Metrics endpoint: `GET /metrics` (Prometheus text)
- Component health: `GET /v1/admin/system` (permissioned; no secrets)
- Topology: ADR-0007
