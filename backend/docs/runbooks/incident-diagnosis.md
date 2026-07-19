# Runbook: Incident diagnosis (request / trace / business IDs)

## Trigger

- Customer or merchant reports failure with a request id, payment stuck, or admin sees 5xx burn.
- Alert links here from API availability or generic error pages.

## Customer impact

Unknown until scoped: checkout, gateway, webhook, or admin-only.

## Safe diagnosis (no secrets/PII)

1. Collect identifiers from the reporter:
 - `request_id` (`X-Request-ID` / envelope `meta.requestId`)
 - `trace_id` (`X-Trace-ID` / `traceparent` 32-hex)
 - business-safe: `merchant_id`, `store_id`, `payment_intent_id`, `order_id`, `callback_id`
2. Logs (JSON): filter `request_id` then `trace_id`.
 ```text
 # example log fields
 msg=http_request request_id=... trace_id=... method=... path=... status=... latency_ms=...
 ```
3. Metrics: `GET /metrics` or Prometheus (live: Bearer token and/or allow-CIDR — see `docs/alerts.md`)
 - `fersaku_http_requests_total{status=~"5.."}`
 - `fersaku_callback_processed_total`
 - `fersaku_outbox_oldest_age_seconds`
 - `fersaku_provider_ops_total{result="auth_error|timeout"}`
 - `fersaku_job_runs_total`
4. Health:
 - `GET /health/live` — process up
 - `GET /health/ready` — accept traffic
 - Admin: `GET /v1/admin/system` componentHealth (Xendit/R2/Redis/mail) — no secrets
5. If payment-related, open `callback-failure.md` / `queue-outbox.md` with safe IDs only.

## Action permissions

- On-call engineer: read logs/metrics/health
- Support: may share `request_id` with merchant; never share tokens/secrets
- Admin mutations: require permission + reason + audit (BE-510)

## Rollback

N/A for pure diagnosis. If bad deploy suspected → previous immutable image (ADR-0007).

## Audit

Record incident ticket with request/trace IDs and timeline; no raw PII.

## Communication owner

On-call primary; merchant-facing = support lead.

## Post-incident

- Capture missing log field or dashboard gap
- Link follow-up to BE-620 if performance-related
