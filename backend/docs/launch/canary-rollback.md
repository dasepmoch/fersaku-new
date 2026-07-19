# BE-630 Canary + rollback

**Executable contract (preferred):** `scripts/release/canary-rollback.sh` +
`backend/docs/launch/release-deployment.md` + release manifest digests.
This document remains the human procedure; the script is the machine-checkable path.

## 1. Controlled live canary (production — OWNER)

### Preconditions

- [ ] Migrations at head on production DB 
- [ ] Secrets in secret manager; `APP_ENV=production`, `XENDIT_MODE=live` 
- [ ] ≥ 2 API + ≥ 1 worker healthy 
- [ ] Synthetic health green against staging; canary image tagged immutable 
- [ ] Owner sign on readiness checklist residual rows 

### Procedure

1. **Deploy canary slice:** roll **one** API task/pod (and optionally one worker) to new image; keep majority on previous known-good. 
2. **Route:** LB canary weight 5–10% of API traffic; **Xendit callbacks** must hit the same version fleet eventually — prefer full API roll only after canary metrics clean **or** ensure callback path version is dual-compatible. 
3. **Watch window:** 15–60 minutes (owner sets). 
4. **Promote:** full rolling deploy of API then worker. 
5. **Post-check:** synthetic against production URL; sample paid sandbox-equivalent if available; confirm outbox lag + callback rejects normal.

### Metric watch list

| Signal | Abort if |
| ------ | -------- |
| `/health/ready` | non-200 on canary |
| HTTP 5xx rate | > baseline + SLO burn |
| p95 latency | SLO burn |
| Callback reject rate | unexplained spike |
| `fersaku_outbox_oldest_age_seconds` | sustained SLO breach |
| Payment paid / settlement mismatch alerts | any new critical |
| Ledger/balance invariant alerts | any |
| Error logs with `INTERNAL_ERROR` | spike |
| Audit chain broken | any |

### Rollback

1. Set LB weight 0% canary / redeploy **previous immutable image** on API (and worker if rolled). 
2. Confirm health + synthetic. 
3. **Do not** auto-down migrate unless eng-approved; schema is forward-compatible. 
4. If bad callbacks accepted: follow `runbooks/callback-failure.md` (replay only with permission). 
5. If money invariant broken: freeze withdrawals via emergency switch; eng+finance. 
6. Incident note + audit of deploy.

### Recovery after rollback

- Verify previous image digest. 
- Drain stuck outbox with known-good workers. 
- Re-run `synthetic_health` and security posture checks. 
- Root-cause before re-canary.

---

## 2. Local canary-equivalent (evidence for BE-630)

Simulates “recreate + verify” without production money:

```bash
cd backend
export BASE_URL=http://127.0.0.1:18080
export DATABASE_URL=postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable

# Capture pre
curl -sS -o /dev/null -w "pre_live=%{http_code}\n" "$BASE_URL/health/live"
curl -sS -o /dev/null -w "pre_ready=%{http_code}\n" "$BASE_URL/health/ready"
curl -sS -o /tmp/pre_metrics.txt -w "pre_metrics=%{http_code}\n" "$BASE_URL/metrics"

# Recreate API (canary-equivalent roll).
# IMPORTANT: if host shell has DATABASE_URL=...@localhost:5433, override for compose:
DATABASE_URL='postgres://fersaku:fersaku_local@postgres:5432/fersaku?sslmode=disable' \
REDIS_URL='redis://redis:6379/0' \
 docker compose up -d --force-recreate api worker
# wait healthy
for i in $(seq 1 30); do
 c=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/health/ready" || echo 000)
 [ "$c" = "200" ] && break
 sleep 2
done

# Post checks
curl -sS -o /dev/null -w "post_live=%{http_code}\n" "$BASE_URL/health/live"
curl -sS -o /dev/null -w "post_ready=%{http_code}\n" "$BASE_URL/health/ready"
MAILPIT_URL=http://127.0.0.1:8025 ./scripts/synthetic_health.sh
```

Evidence: `backend/tmp/launch-evidence/30-canary-local.txt`.

### Local rollback drill

```bash
# Re-recreate api (stand-in for previous image roll); same in-network DATABASE_URL override
DATABASE_URL='postgres://fersaku:fersaku_local@postgres:5432/fersaku?sslmode=disable' \
REDIS_URL='redis://redis:6379/0' \
 docker compose up -d --force-recreate api worker
./scripts/synthetic_health.sh
```

---

## 3. Owner residual

| Item | Status |
| ---- | ------ |
| Live canary with real Xendit LIVE traffic | **OWNER** after this package |
| Production rollback run with real LB weights | **OWNER** |
| Local canary-equivalent | **DONE** in launch evidence |
