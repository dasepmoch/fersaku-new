# Structured log field conventions (BE-600)

JSON logs via `slog` (`internal/adapters/observability`). Never log raw request/response bodies, cookies, `Authorization`, API keys, bank numbers, KYC images, or full emails in operational paths.

## Required / common fields

| Field | Type | Notes |
| ----- | ---- | ----- |
| `timestamp` | RFC3339 | slog default |
| `level` | string | debug/info/warn/error |
| `msg` | string | stable event name (`http_request`, `AUDIT_CHAIN_BROKEN`, …) |
| `service` | string | `fersaku-api` / `fersaku-worker` |
| `version` | string | build version when available |
| `env` | string | deployment env only (`local`/`staging`/`production`) — never financial identity |
| `request_id` | string | from `X-Request-ID` (sanitized ≤128) |
| `trace_id` | string | 32-hex W3C trace-id (from `traceparent` or derived) |
| `method` | string | HTTP method |
| `path` | string | request path (prefer route template in metrics, not logs of raw IDs when avoidable) |
| `status` | int | HTTP status |
| `latency_ms` | int | request duration |
| `client_ip` | string | trusted-proxy resolved IP only |
| `route_class` | string | rate-limit class (`health`/`auth`/`mutation`/`callback`/…) — not user-controlled |
| `error_code` | string | stable platform error code when applicable |
| `operation` | string | use-case name when set by application |
| `result` | string | outcome class (`accepted`, `rejected`, `ok`, `broken`) |

## Business-safe IDs (allowed)

Use opaque internal IDs only when operationally needed:

- `merchant_id`, `store_id` (tenant scope)
- `payment_intent_id` / `intent_id` (internal ULID)
- `order_id`, `callback_id`, `outbox_id`, `delivery_id` (internal)
- `payment_mode` (`SANDBOX` \| `LIVE`)
- `source` (`STOREFRONT` \| `QRIS_API`)
- `actor_type` + `actor_id_hash` (hash subject; never raw email in default http logs)

## Forbidden in default logs

- Email, phone, full name, address
- Bank account numbers, API key material, webhook secrets, session tokens
- Provider raw payload bodies (store digest/reference only)
- Unbounded free-text buyer notes

## Correlation

1. Client/ingress may send `X-Request-ID` and optional W3C `traceparent`.
2. Frontend HTTP clients attach both `X-Request-ID` and derived `traceparent` (no payment/KYC payload).
3. Response always includes `X-Request-ID`; when trace is active also `traceparent` and `X-Trace-ID`.
4. Success/problem envelopes include `meta.requestId` / `problem.requestId`.
5. Jobs emit `job.<label>` spans + `fersaku_job_runs_total` with the same process `service`/`env`/`release`.
6. Provider adapters emit `provider.<name>` client spans and `fersaku_provider_ops_total{provider,operation,result}`.

## Telemetry process fields

| Field | Notes |
| ----- | ----- |
| `service` | `fersaku-api` / `fersaku-worker` |
| `env` | deployment env only |
| `release` | `RELEASE_ID` / build version |
| `http.route` | chi route template |
| `http.status_code` | status class for spans |
| `error.class` | bounded (`http_5xx`, `http_4xx`, …) |
| `job.name` / `job.result` | worker |
| `provider` / `provider.operation` / `provider.result` | duitku\|xendit + create\|status\|… + ok\|auth_error\|timeout\|error |

See runbook: `docs/runbooks/incident-diagnosis.md` and alert catalog: `docs/alerts.md`.
