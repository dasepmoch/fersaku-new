# Runbook: Queue / outbox recovery

## Trigger

- `fersaku_outbox_oldest_age_seconds` high or `fersaku_outbox_pending` growing.
- Redis outage (Redis is **non-authoritative** — wake-up only).
- Synthetic step `outbox` fails.

## Customer impact

Delayed email, seller webhooks, callback process, settlement release — financial truth remains in Postgres.

## Safe diagnosis

```sql
-- pending/failed backlog (no payload dump)
SELECT topic, status, COUNT(*), MIN(created_at) AS oldest
FROM outbox_events
WHERE status IN ('pending', 'failed', 'processing')
GROUP BY 1, 2
ORDER BY oldest ASC;
```

Topics of interest: `provider_callback.process`, `seller_webhook.deliver`, `email.send`, `notification.dispatch`.

## Actions

1. Confirm worker process healthy and polling.
2. Redis down: workers still poll Postgres; fix Redis for wake-up latency only.
3. Stuck `processing` with expired lease: worker reclaim on next poll.
4. `dead` rows: investigate handler; admin retry for seller webhooks only via outbound admin paths.
5. Never flush Postgres outbox to “fix” money state.

## Permissions

On-call engineer; admin webhook retry permissioned.

## Rollback

Scale worker replicas; previous worker image if bad handler.

## Audit

Document topic counts and oldest age; no PII from payloads.

## Communication owner

Platform on-call.

## Post-incident

Tune concurrency/pool (BE-620); verify Redis flush does not corrupt ledger tests.
