# Launch operations dashboard (markdown definition)

Prometheus datasource scraping `GET /metrics` on API (and worker if exposed later).

## Panels

### 1. HTTP request rate
- Query: `sum(rate(fersaku_http_requests_total[5m])) by (status)`
- Alert link: `runbooks/incident-diagnosis.md`

### 2. HTTP p95 latency
- Query: histogram quantile on `fersaku_http_request_duration_ms_bucket`
- Group by `route` (template only)

### 3. Payment paid rate
- Query: `rate(fersaku_payment_paid_total[5m])`
- Runbook: `callback-failure.md`

### 4. Callback results
- Query: `sum(rate(fersaku_callback_processed_total[5m])) by (result)`
- Separate from webhook panel

### 5. Seller webhook delivery
- Query: `sum(rate(fersaku_webhook_delivery_total[5m])) by (result)`
- Runbook: outbound dead-letter (see queue-outbox + BE-420 admin)

### 6. Outbox lag
- Queries: `fersaku_outbox_pending`, `fersaku_outbox_oldest_age_seconds`
- Runbook: `queue-outbox.md`

### 7. Audit chain
- Queries: `fersaku_audit_chain_ok`, `increase(fersaku_audit_chain_status_total{result="broken"}[1h])`
- Runbook: `backup-restore-integrity.md`

### 8. Provider ops (auth/timeout)
- Query: `sum(rate(fersaku_provider_ops_total[5m])) by (provider, result)`
- Alert catalog: `../alerts.md` A-PROV-AUTH / A-PROV-TO

### 9. Worker jobs
- Query: `sum(rate(fersaku_job_runs_total[5m])) by (job, result)`

### 10. Redis / DB pool / telemetry health
- Queries: `fersaku_redis_failures_total`, `fersaku_db_pool_*` gauges, `fersaku_telemetry_spans_dropped_total`
- Runbook: `incident-diagnosis.md`

### 11. Malware quarantine
- Queries: `fersaku_malware_quarantine_backlog`, `fersaku_malware_scan_total`
- Runbook: `malware-scan-quarantine.md`

## Label policy

No email, order id, payment reference, or API key prefix on any series.

## Alert / runbook index

Full actionable catalog: `backend/docs/alerts.md`.
