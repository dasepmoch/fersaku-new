# Runbook: Sandbox QRIS synthetic health

## Trigger

- Synthetic script `backend/scripts/synthetic_health.sh` fails step `sandbox_qris` / gateway create.
- Staging canary before release.

## Customer impact

Sandbox merchants cannot create QRIS intents; **live wallet must remain unaffected** (ADR-0007 isolation).

## Safe diagnosis

1. Confirm `XENDIT_MODE=fake` (local) or sandbox credentials (staging).
2. `GET /health/ready` and `GET /metrics` for gateway routes 5xx.
3. Logs: `request_id` on `POST /v1/gateway/payments` (or legacy `/v1/qris`).
4. Check emergency switch `QRIS_CHECKOUT` not disabled (`GET /v1/admin/system`).
5. Capability: sandbox keys work without KYC; live must not be used in this check.

## Actions

- Local: restart api/worker compose; re-run synthetic script.
- Staging: verify fake/sandbox adapter; roll back deploy if create error rate elevated.
- Never point synthetic at LIVE keys in automated loops.

## Permissions

On-call + payments engineer. No production secret paste into tickets.

## Rollback

Previous API image; feature flag emergency QRIS off only if live impact (separate runbook).

## Audit

Note synthetic failure time + `request_id`.

## Communication owner

Platform on-call.

## Post-incident

Extend synthetic assertions; confirm sandbox ledger namespace isolation tests still green.
