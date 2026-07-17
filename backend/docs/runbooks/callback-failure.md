# Runbook: Inbound Xendit callback failure

## Trigger

- Spike in `fersaku_callback_processed_total{result="rejected"}` or invalid token.
- Provider paid but local pending (mismatch age).
- Synthetic step `callback_token_reject` unexpected pass/fail.

## Customer impact

Payments may stay non-PAID; delivery/ledger delayed. Hosted + gateway both use same Xendit account (ADR-0002).

## Safe diagnosis

1. Metrics: accepted vs rejected vs duplicate.
2. Logs: `callback_id`, `intent_id`, `request_id` — **never** log raw callback body in tickets.
3. Admin list (permissioned): `/v1/admin/provider-callbacks` — no outbound seller delivery IDs.
4. Token: `X-Callback-Token` constant-time; invalid → `provider_callback_rejections` only.
5. Canonical key: `(provider, account_scope, payment_mode, provider_event_id)`.
6. Late paid after expire: alert `late_paid`; settlement once.

## Actions

| Symptom | Action |
| ------- | ------ |
| Invalid token spike | Rotate/verify webhook token in secret manager; check Xendit dashboard URL |
| Accepted but not PAID | Inspect outbox `provider_callback.process`; run worker; replay **inbound** only with reason |
| Duplicate flood | Expected idempotent; verify single settlement |
| Cross-mode collision | Verify SANDBOX vs LIVE isolation |

Replay: `POST /v1/admin/provider-callbacks/{callbackId}/replay` requires `provider_callbacks.replay` + reason.

## Permissions

Payments admin / SUPER_ADMIN for replay. Support: read-only.

## Rollback

N/A for token fix. Bad worker deploy → roll back worker image.

## Audit

All replays audited; include `callback_id` + reason.

## Communication owner

Payments on-call.

## Post-incident

Update synthetic; confirm concurrent paid tests still pass.
