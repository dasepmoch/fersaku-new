# P1 — Wire observability nyata dan alert yang dapat ditindaklanjuti

## Bukti temuan

- `backend/internal/config/config.go:123-125,177` membaca `OTEL_EXPORTER_OTLP_ENDPOINT`, tetapi tidak ada SDK/exporter/span wiring; trace middleware hanya membuat/echo trace context.
- `frontend/shared/observability/reporter.ts:45-65` default reporter adalah no-op dan tidak ditemukan production `setObservabilityReporter`.
- Error boundaries memanggil `reportError`, sehingga error dapat hilang tanpa sink.
- Metrics endpoint hanya disebut perlu dibatasi network/WAF dalam docs, belum menjadi deployment-enforced policy.

## Langkah implementasi

1. Pilih backend telemetry yang disetujui dan wire OTEL HTTP/DB/provider/outbox/job spans dengan sampling, timeout, batch, queue, and shutdown flush.
2. Propagate request ID/trace ID dari frontend → API → provider/job tanpa raw payment/KYC payload. Standardize service, env, release, route template, status, error class.
3. Install frontend reporter saat bootstrap/error boundary dengan sink real; no-op hanya local/test atau explicit disabled mode yang terlihat di diagnostics.
4. Tambahkan RED metrics dan SLO alerts: 5xx, latency, provider auth/timeout, callback backlog/replay, upload scanner quarantine, queue lag, DB pool saturation, Redis failures, delivery DLQ, and payout mismatch.
5. Protect `/metrics` with network/auth policy and verify no high-cardinality raw IDs, emails, headers, signatures, account numbers, or KYC data.
6. Add synthetic dashboard/runbook links and test alert routing in staging without paging real users.

## Acceptance criteria

- Trace appears across at least one checkout, callback, upload scan, and worker job in staging with shared correlation ID.
- Frontend error boundary produces a redacted event in the configured sink; reporter absence fails readiness or is explicit non-prod mode.
- Alerts have owner, threshold, window, severity, runbook, and recovery test. No secret/PII leakage in sampled logs.
- Telemetry shutdown flush and exporter outage do not block money mutation indefinitely.

