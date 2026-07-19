# Alert catalog (GAP-07 / BE-600)

Actionable alerts for staging/production. Every row has owner, threshold, window, severity, runbook, and recovery test. **Do not invent firings** — wire in Prometheus/Alertmanager or equivalent; test routing in staging without paging real users.

Label policy: low-cardinality only. Never alert on raw order IDs, emails, headers, signatures, account numbers, or KYC data.

## Dashboard links

| Dashboard | Path |
| --------- | ---- |
| Launch overview | `backend/docs/dashboards/launch-overview.md` |
| JSON panels | `backend/docs/dashboards/launch-overview.json` |
| SLO targets | `backend/docs/slo.md` |
| Incident diagnosis | `backend/docs/runbooks/incident-diagnosis.md` |

## Alert definitions

| ID | Name | Owner | Severity | Expr (Prometheus-style) | Window | Threshold | Runbook | Recovery test (staging) |
| -- | ---- | ----- | -------- | ----------------------- | ------ | --------- | ------- | ----------------------- |
| A-5XX | API 5xx burn | platform-oncall | page | `sum(rate(fersaku_http_requests_total{status=~"5.."}[5m])) / sum(rate(fersaku_http_requests_total[5m])) > 0.02` | 5m for 2m | >2% 5xx | `runbooks/incident-diagnosis.md` | Force handler panic once in staging; confirm alert → sink; recover process |
| A-LAT | HTTP p95 latency | platform-oncall | ticket | histogram quantile p95 on `fersaku_http_request_duration_ms_bucket` by route | 10m | p95 > 5s | `runbooks/incident-diagnosis.md` | Synthetic slow route or load drill; confirm clear when load drops |
| A-READY | Readiness failing | platform-oncall | page | probe `/health/ready` != 200 | 2m | consecutive fail ≥2m | `runbooks/incident-diagnosis.md` | Stop Redis briefly in staging; restore; alert clears |
| A-CB-REJ | Callback rejection storm | payments | page | `sum(rate(fersaku_callback_processed_total{result="rejected"}[5m])) > 5` | 5m | sustained | `runbooks/callback-failure.md` | Invalid signature callback; then valid; rate drops |
| A-CB-BACKLOG | Callback/outbox lag | payments | page | `fersaku_outbox_oldest_age_seconds > 600` | 5m | age >10m | `runbooks/queue-outbox.md` | Pause worker; resume; age falls |
| A-WH-DLQ | Webhook delivery DLQ | webhooks | ticket | `sum(rate(fersaku_webhook_delivery_total{result=~"dead_letter\|dlq"}[15m])) > 0` or `fersaku_delivery_dlq_total` increase | 15m | any increase | `runbooks/queue-outbox.md` | Force merchant 500; repair endpoint; DLQ drains |
| A-PROV-AUTH | Provider auth failure | payments | page | `sum(rate(fersaku_provider_ops_total{result="auth_error"}[10m])) > 0` | 10m | any | `runbooks/callback-failure.md` | Rotate wrong key in staging only; fix key; clear |
| A-PROV-TO | Provider timeout | payments | ticket | `sum(rate(fersaku_provider_ops_total{result="timeout"}[10m])) > 3` | 10m | >3/min sustained | `runbooks/sandbox-qris-synthetic.md` | Inject timeout stub; restore |
| A-SCAN-Q | Malware quarantine backlog | objects | ticket | `fersaku_malware_quarantine_backlog > 50` | 15m | backlog | `runbooks/malware-scan-quarantine.md` | Pause scanner; resume |
| A-REDIS | Redis failures | platform-oncall | page | `increase(fersaku_redis_failures_total[5m]) > 10` | 5m | spike | `runbooks/incident-diagnosis.md` | Block Redis; restore |
| A-DB-POOL | DB pool saturation | platform-oncall | page | `fersaku_db_pool_empty_total` increase or acquired≈max with idle=0 | 5m | sustained | `docs/performance/pool-tuning.md` | Load test; scale or lower concurrency |
| A-PAYOUT-MM | Payout/payment mismatch | finance-oncall | page | `increase(fersaku_payout_mismatch_total[15m]) > 0` | 15m | any | `runbooks/callback-failure.md` | Synthetic mismatch drill; reconcile |
| A-AUDIT | Audit chain broken | security-oncall | page | `fersaku_audit_chain_ok == 0` or `increase(fersaku_audit_chain_status_total{result="broken"}[1h]) > 0` | immediate | any | `runbooks/backup-restore-integrity.md` | Integrity job fail inject (staging only) |
| A-TEL-DROP | Telemetry queue drops | platform-oncall | ticket | `increase(fersaku_telemetry_spans_dropped_total[15m]) > 100` | 15m | sustained drop | this doc §Telemetry | Flood spans; confirm money path still succeeds |

## Telemetry exporter policy

- OTLP export timeout default **2s**; shutdown flush **≤3s**.
- Exporter outage **must not** block checkout/callback/withdrawal handlers.
- Empty `OTEL_EXPORTER_OTLP_ENDPOINT` → in-process sink only (local/test).

## Metrics scrape protection

| Env | Policy |
| --- | ------ |
| local/test | Open scrape (`MetricsAccess.Open`) |
| staging/production | Require `METRICS_BEARER_TOKEN` and/or `METRICS_ALLOW_CIDRS` (config fail-closed) |

Prometheus scrape config example (token):

```yaml
authorization:
  type: Bearer
  credentials_file: /etc/prometheus/metrics_token
```

## Staging alert routing (no real pages)

1. Point Alertmanager receiver to a **staging Slack/email** channel or null sink.
2. Fire A-5XX or A-READY via controlled fault.
3. Confirm annotation includes runbook URL + `request_id`/`trace_id` when request-scoped.
4. Confirm production pager is **not** in the staging route tree.

## Correlation fields

- `request_id` / `X-Request-ID`
- `trace_id` / `X-Trace-ID` / W3C `traceparent`
- `release` / `RELEASE_ID`
- `service` (`fersaku-api` \| `fersaku-worker`)
- `env` (deployment only)
- `http.route` template (not raw path IDs)
- `error.class` (bounded)

See `observability-log-fields.md`.
