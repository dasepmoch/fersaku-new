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

## Label policy

No email, order id, payment reference, or API key prefix on any series.
