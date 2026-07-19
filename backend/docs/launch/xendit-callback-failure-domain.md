# BE-630 Xendit callback failure-domain test plan

**Goal:** Prove invalid tokens cannot mutate money state, and inbound callback processing is isolated from outbound seller webhooks and other failure domains.

**Authority:** BE-330, BE-600 runbook `callback-failure.md`, §16 Callback safety / Paid precedence.

---

## 1. Failure domains (isolation map)

| Domain | Surface | Authority |
| ------ | ------- | --------- |
| **Inbound provider callback** | `POST /v1/webhooks/xendit` | Token + durable `payment_provider_events` |
| **Rejection log** | `provider_callback_rejections` | Invalid/missing token only — no intent mutation |
| **Finalization worker** | outbox `provider_callback.process` | Lease-based; multi-worker safe |
| **Outbound seller webhook** | separate admin namespace + deliveries | SSRF-guarded; different secrets |
| **Admin replay** | `POST /v1/admin/provider-callbacks/{id}/replay` | Permission + reason + audit |

Isolation rules:

1. Invalid `X-Callback-Token` → 401/403 + rejection row; **no** PAID, settlement, grant, or ledger journal. 
2. Outbound seller webhook failure must **not** roll back inbound paid finalization. 
3. SANDBOX vs LIVE share account scope but **never** collide on `(provider, account_scope, payment_mode, provider_event_id)`. 
4. Worker down: API still accepts valid callbacks (durable); lag metrics rise.

---

## 2. Test plan

### 2.1 Automated (required green)

| Case | Test / script | Expected |
| ---- | ------------- | -------- |
| Invalid token | `TestCallback_InvalidToken_RejectionOnly` | Rejection only; not paid |
| Missing token | `TestCallback_MissingToken_Rejection` | Rejection |
| Concurrent duplicate paid | `TestCallback_DuplicatePaid_SingleEffect` | Single effect (80×) |
| Late paid after expire | `TestCallback_LatePaidAfterExpire` | One late post + delivery safe |
| Cross-mode | `TestCallback_CrossPaymentMode_NoCollision` | No SANDBOX/LIVE collision |
| Synthetic reject | `scripts/synthetic_health.sh` | HTTP 401/403 on bad token |

### 2.2 Local failure-domain drills

| Drill | Steps | Pass criteria |
| ----- | ----- | ------------- |
| D1 Invalid token live API | POST bad token to `:18080/v1/webhooks/xendit` | 401/403; metrics reject++ |
| D2 Worker stop | `docker compose stop worker`; valid path still health; outbox age may rise | API live/ready 200 |
| D3 Worker start | `docker compose start worker` | Outbox drains; no double settle (invariants in integration) |
| D4 Redis flush | resilience drill | Financial rows unchanged |

### 2.3 Staging / production (OWNER)

| Drill | Owner |
| ----- | ----- |
| Xendit dashboard test webhook to staging URL | Payments |
| Token rotation with dual-read window if needed | Eng + Payments |
| AZ/API task kill while callback traffic | Ops |

---

## 3. Local evidence (BE-630)

Captured under `backend/tmp/launch-evidence/`:

| Artifact | Content |
| -------- | ------- |
| `03-synthetic-health.txt` | Includes `callback invalid token rejected` |
| `11-go-integration.txt` | Callback tests in suite |
| `12-callback-failure-domain.txt` | Explicit curl invalid/missing token + status codes |
| `05-resilience-drills.txt` | Worker/Redis domain |

### Manual curl recipe (reproducible)

```bash
BASE_URL="${BASE_URL:-http://127.0.0.1:18080}"

# Invalid token
curl -sS -o /tmp/cb_body -w "%{http_code}\n" -X POST \
 -H "Content-Type: application/json" \
 -H "X-Callback-Token: definitely-invalid-token-for-launch" \
 -d '{"event":"payment.paid","id":"launch-fd-1"}' \
 "$BASE_URL/v1/webhooks/xendit"
# expect 401 or 403

# Missing token
curl -sS -o /tmp/cb_body2 -w "%{http_code}\n" -X POST \
 -H "Content-Type: application/json" \
 -d '{"event":"payment.paid","id":"launch-fd-2"}' \
 "$BASE_URL/v1/webhooks/xendit"
# expect 401 or 403
```

---

## 4. Metrics watch list (callback domain)

| Metric / signal | Healthy | Page |
| --------------- | ------- | ---- |
| `fersaku_callback_*` rejected rate | baseline noise | spike + no accepts |
| accepted without PAID lag | low | rising with worker lag |
| `fersaku_outbox_oldest_age_seconds` | SLO | breach |
| duplicate accepts | idempotent | settlement count > 1 for key |

---

## 5. Runbook link

Operational response: `docs/runbooks/callback-failure.md`.
