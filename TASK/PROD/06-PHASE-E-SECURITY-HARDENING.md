# 06 — Phase E: Security hardening

**Depends on:** A20; ideally after B20/C10 webhook auth exists

---

## Outcomes

1. Session cookies Secure on HTTPS (already partially done; verify tunnel + prod).
2. Webhook auth fail-closed and tested.
3. Rate limits sane for login/checkout/webhooks.
4. No secrets in logs, evidence, or FE bundles.
5. Auth policy remains **no MFA**.

---

## Tasks

### PROD-E10 — Cookie / CSRF / HTTPS verification

| Priority | P0 |
| -------- | -- |

**Do**

1. Verify Secure cookie on HTTPS origins (Origin / X-Forwarded-Proto).
2. CSRF double-submit after hard refresh still works (GET session rotate).
3. Stale cookie does not permanently block login.
4. Evidence: browser or curl harness on `https://fersaku.net`.

**Acceptance**

- [ ] Login seller + admin without MFA.
- [ ] Mutation after refresh succeeds with CSRF.

---

### PROD-E20 — Webhook security matrix

| Priority | P0 |
| -------- | -- |

**Do**

1. Table of tests: missing/invalid signature (Duitku), missing/invalid token (Xendit), oversized body, wrong method.
2. Ensure raw payloads not written to app logs.
3. Admin replay remains permission-gated.

**Acceptance**

- [ ] Automated tests listed in evidence with pass output.

---

### PROD-E30 — Rate limit & abuse

| Priority | P1 |
| -------- | -- |

**Do**

1. Review token bucket / Redis limiter for login, checkout create, webhook IP.
2. Ensure FE does not storm `/v1/auth/session` (prior fix); add regression test if missing.
3. Document Retry-After behavior.

**Acceptance**

- [ ] No session bootstrap loop under dashboard load test light script.

---

### PROD-E40 — Secret scanning hygiene

| Priority | P0 |
| -------- | -- |

**Do**

1. Run `backend/scripts/security_scan.sh` (or repo equivalent).
2. Grep ensure `/var/www/pg.txt` values never appear under `TASK/PROD/evidence` or repo.
3. Add CI check or document manual gate in phase F.

**Acceptance**

- [ ] Scan clean for high-confidence secret patterns.
- [ ] Evidence states “no secret material”.

---

## Phase E exit criteria

- [ ] E10, E20, E40 done.
