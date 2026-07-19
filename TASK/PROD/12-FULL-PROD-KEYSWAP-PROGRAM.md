# 12 — Full-prod “key-swap ready” program

> **Created:** 2026-07-19  
> **Goal:** Setelah program ini selesai, go-live = **isi secret LIVE + flip env** (bukan nulis adapter/fitur baru).  
> **Prerequisite:** Phase A–G agent work + E2E headed (sandbox) sudah hijau.  
> **Auth:** no MFA. **Money:** Duitku QRIS in · Xendit disbursement out.

---

## 0. Honest baseline (jangan klaim berlebih)

| Layer | State |
|-------|--------|
| Code money path (sandbox) | **Done** — intent → Duitku → webhook → PAID → ledger |
| Headed product E2E | **Done** — 14/14 against seed + sandbox API |
| LIVE money | **Blocked** — G40 butuh human `GO LIVE CANARY` |
| Ops (SM / HA / SMTP / R2) | **Belum** — ini yang bikin “belum cuma ganti key” |
| Historical `TASK/09` G0–G8 / full-cutover cells | Masih formal open — tutup atau **waive** eksplisit |

**Definisi “key-swap ready”:**  
Deploy prod image + env matrix LIVE → satu pembayaran kecil Duitku LIVE + (opsional) satu WD Xendit LIVE bisa dijalankan **tanpa** code change, hanya secret + dashboard callback + GO.

---

## 1. What stays deferred (jangan masuk key-swap scope)

Tulis di evidence bila disentuh; **jangan IMPLEMENT diam-diam:**

| Surface | Disposition | Ref |
|---------|-------------|-----|
| Google OAuth seller | DISABLED | AUT-130 / TASK/10 |
| Contact form submit | DISABLED | PUB-200 |
| Admin campaigns | DISABLED | ADM-380 |
| Personal avatar / photo | DISABLED | INT-175 |
| Buyer email-change full dual-confirm UI | DISABLED | BUY-120 |
| API playground live Send | DISABLED (mock-only) | PUB-230 |
| Refund/dispute console | NON-GOAL | PROD/00 |
| Duitku payout / multi-provider failover UI | NON-GOAL | PROD/00 |
| Full storefront builder E2E matrix | NOT claimed | PROD/E2E |
| Full admin ops button matrix | NOT claimed | PROD/E2E |

---

## 2. Phase map (jalankan berurutan)

```text
K0  Docs & policy freeze          KEY-00..KEY-02
K1  Ops platform                  KEY-10..KEY-14
K2  Identity & mail (no seed)     KEY-20..KEY-23
K3  FE/API deploy contract        KEY-30..KEY-33
K4  Provider dashboards           KEY-40..KEY-42
K5  Quality close / waive         KEY-50..KEY-52
K6  Human sign + canary           KEY-60..KEY-62
K7  Post-canary harden            KEY-70..KEY-71
```

Board: [`13-KEYSWAP-STATUS.md`](13-KEYSWAP-STATUS.md)  
Evidence: `TASK/PROD/evidence/<KEY-ID>/`

---

## 3. Task catalog

### K0 — Docs & policy freeze

#### KEY-00 — Key-swap DoD freeze
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human + agent |
| Depends | PROD board A–F done |
| Type | doc |

**Do**
- Tanda-tangani definisi di §0 program ini di STATUS.
- Daftar env yang **boleh** diganti saat go-live (lihat §5).
- Daftar yang **tidak** boleh diganti tanpa task baru (schema, provider ports, UI freeze).

**Accept**
- [ ] STATUS KEY-00 = done + evidence 1 halaman
- [ ] Tidak ada “silent scope creep” di deferred table

---

#### KEY-01 — Reconcile residual docs (B50 closed)
| Field | Value |
|-------|--------|
| P | P1 |
| Owner | agent |
| Depends | KEY-00 |
| Type | doc |

**Do**
- Update teks usang di `backend/docs/security/residual-risks.md` (RR yang masih bilang B50 unpaid).
- Update `backend/docs/launch/readiness-checklist.md` ke dual-provider (Duitku pay + Xendit WD).
- Update F40 canary-sandbox note bila masih stale.

**Accept**
- [ ] Tidak ada residual yang kontradiksi B50 CLOSED
- [ ] Evidence diff list path

---

#### KEY-02 — Non-goals & DISABLED surface register (launch freeze)
| Field | Value |
|-------|--------|
| P | P1 |
| Owner | agent |
| Depends | KEY-00 |
| Type | doc |

**Do**
- Salin tabel §1 ke evidence + link TASK/10.
- Pastikan FE/API mode tidak “menghidupkan” surface DISABLED.

**Accept**
- [ ] Register signed/dated
- [ ] Smoke: playground Send tetap disabled saat `DATA_SOURCE=api`

---

### K1 — Ops platform (bukan ganti key doang)

#### KEY-10 — Secret manager inventory + populate plan
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human ops (+ agent inventory) |
| Depends | KEY-00, PROD-G10 |
| Type | ops |

**Do**
- Dari `10-SECRETS-AND-ENV-MATRIX.md`: setiap secret punya path SM (AWS/GCP/Vault/1P).
- Larang prod host baca `/var/www/pg.txt`.
- Rotation owner + cadence.

**Accept**
- [ ] Inventory redacted complete
- [ ] Prod deploy runbook: “secrets from SM only”

---

#### KEY-11 — Managed Postgres + PITR restore drill
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human ops |
| Depends | KEY-10 |
| Type | ops |

**Do**
- Managed PG (atau HA setara), automated backup, **satu restore drill** ke staging clone.
- Connection string hanya via SM; TLS.

**Accept**
- [ ] Restore drill evidence (timestamp, RTO/RPO noted)
- [ ] App boot against restored clone OK

---

#### KEY-12 — Managed Redis + rate-limit durability
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human ops |
| Depends | KEY-10 |
| Type | ops |

**Do**
- Redis managed/TLS; eviction policy documented.
- Confirm rate-limit/session deps still correct.

**Accept**
- [ ] Staging boot with managed Redis
- [ ] E20/E30 checks still green

---

#### KEY-13 — Object storage R2 production (no MinIO)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human ops |
| Depends | KEY-10 |
| Type | ops |

**Do**
- Private + public bucket R2; credentials SM.
- Fail-closed: MinIO endpoint ditolak di `APP_ENV=production`.
- KYC stream no-store path verified.

**Accept**
- [ ] Upload/download smoke non-KYC
- [ ] KYC encrypt path smoke (with KEY-22 keys)

---

#### KEY-14 — Production SMTP (not Mailpit)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human ops |
| Depends | KEY-10 |
| Type | ops |

**Do**
- `MAIL_MODE=smtp` + host/user/pass/from di SM.
- Deliver: magic-link buyer + 1 transactional (order/delivery) ke inbox nyata.

**Accept**
- [ ] Email received < 2 menit
- [ ] Mailpit not referenced in prod compose/env

---

### K2 — Identity & data (no seed in prod)

#### KEY-20 — Production identity bootstrap (no QLT seed)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human + agent |
| Depends | KEY-11 |
| Type | code/ops |

**Do**
- Jalur bootstrap admin/seller **tanpa** `cmd/seed` di production (`GuardNonProduction` tetap).
- Dokumentasikan `BOOTSTRAP_ADMIN_EMAIL` / one-shot ops procedure.
- Pastikan seed binary **exit non-zero** on `APP_ENV=production`.

**Accept**
- [ ] Test: seed refused on production env
- [ ] Runbook: create first SUPER_ADMIN + first merchant owner

---

#### KEY-21 — Encryption keys (KYC + stock)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human ops |
| Depends | KEY-10 |
| Type | ops |

**Do**
- Generate + store `KYC_ENCRYPTION_KEY`, `STOCK_ENCRYPTION_KEY` (and any other required encrypt keys from matrix).
- Staging smoke: stock reserve + KYC document stream.

**Accept**
- [ ] Keys present in SM for staging+prod
- [ ] No plaintext secrets in evidence

---

#### KEY-22 — Staging dual-provider sandbox parity (pre-LIVE)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | agent + ops |
| Depends | KEY-11..14, KEY-21 |
| Type | verify |

**Do**
- Deploy staging image = prod candidate.
- Env: `PAYMENT_PROVIDER=duitku` `DUITKU_ENV=sandbox` `DISBURSEMENT_PROVIDER=xendit` `XENDIT_ENV=sandbox`.
- Re-run money path: checkout PAID + settlement; withdrawal quote (+ C30b if bank sandbox available).

**Accept**
- [ ] Same chain as B50 on **staging host** (not only laptop compose)
- [ ] Evidence IDs (intent/order) no secrets

---

#### KEY-23 — Kill demo seed personas from public surfaces
| Field | Value |
|-------|--------|
| P | P1 |
| Owner | agent |
| Depends | KEY-20 |
| Type | code/config |

**Do**
- Prod/staging public must not depend on `seed-store-a` / seed emails.
- Marketing featured catalog = real data or empty state (no fake store).

**Accept**
- [ ] Public home/storefront no seed fixtures when `APP_ENV=production`
- [ ] Empty-state UI OK (UI freeze)

---

### K3 — FE / API deploy contract (fail-closed)

#### KEY-30 — FE production env contract
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | agent + ops |
| Depends | KEY-22 |
| Type | config |

**Mandatory prod FE env**
```bash
NEXT_PUBLIC_DATA_SOURCE=api
NEXT_PUBLIC_APP_STAGE=live
# NEXT_PUBLIC_API_URL must be empty (same-origin /v1)
API_INTERNAL_URL=<internal API>
```

**Accept**
- [ ] Boot fails or domains disabled if mock bootstrap attempted on live
- [ ] All 9 domain sources resolve **api** (or intentional disabled), never mock fixtures
- [ ] Deploy checklist in evidence

---

#### KEY-31 — API production env contract (fail-closed providers)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | agent + ops |
| Depends | KEY-22 |
| Type | config |

**Mandatory prod API env (names only — values in SM)**
```text
APP_ENV=production
PAYMENT_PROVIDER=duitku          # never fake
DUITKU_ENV=production            # key-swap moment
DISBURSEMENT_PROVIDER=xendit     # never fake
XENDIT_ENV=production            # key-swap moment
MAIL_MODE=smtp
# encryption keys, R2, DB, Redis from SM
```

**Accept**
- [ ] Config test: fake providers rejected on production
- [ ] Health live/ready green
- [ ] Webhook routes mounted (401 on empty body, not 404)

---

#### KEY-32 — Cookie / HTTPS / CSRF on real domain
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | agent + human browser |
| Depends | KEY-30, KEY-31 |
| Type | verify |

**Do**
- Login seller on `https://…` : `fersaku_session` HttpOnly + Secure + SameSite.
- Mutation after hard refresh with CSRF.
- Logout clears access to private routes.

**Accept**
- [ ] E10 residual closed with browser capture (redacted)
- [ ] E2E-11 equivalent on real domain

---

#### KEY-33 — Public edge: TLS, CDN, `/v1` proxy
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human ops |
| Depends | KEY-30 |
| Type | ops |

**Do**
- `fersaku.net` + `api.fersaku.net` (or same-origin rewrite) TLS valid.
- FE same-origin `/v1/*` → API.
- HSTS as per security policy.

**Accept**
- [ ] curl health + login from public host
- [ ] No mixed-content

---

### K4 — Provider dashboards (pre key-swap)

#### KEY-40 — Duitku dashboard: callback URL + sandbox proof on staging
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human |
| Depends | KEY-31, KEY-33 |
| Type | ops |

**Do**
- Callback: `https://api…/v1/webhooks/duitku` (or documented path).
- Sandbox merchant code/key match SM.
- One paid sandbox callback observed in logs/DB.

**Accept**
- [ ] Screenshot dashboard URL (no keys)
- [ ] Intent PAID on staging

---

#### KEY-41 — Xendit dashboard: disbursement webhook + sandbox
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human |
| Depends | KEY-31 |
| Type | ops |

**Do**
- Disbursement webhook token match SM.
- Sandbox payout path verified (or explicit waiver if product postpones WD live).

**Accept**
- [ ] Webhook 200 on test event
- [ ] Or signed defer of live WD with date

---

#### KEY-42 — C30b Xendit sandbox bank proof (optional hard)
| Field | Value |
|-------|--------|
| P | P1 |
| Owner | agent + human |
| Depends | KEY-41 |
| Type | verify |

**Do**
- One sandbox disbursement COMPLETED/FAILED via real Xendit sandbox webhook.
- No customer funds.

**Accept**
- [ ] Withdrawal row terminal state + evidence
- [ ] Replay safe

---

### K5 — Quality close / waive

#### KEY-50 — Map PROD F-cells + E2E → launch quality
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | agent |
| Depends | KEY-22, E2E pack done |
| Type | doc/qa |

**Do**
- Table: PROD-F10/20/30 + E2E-00..13 → covers which historical QLT cells.
- Either fill remaining critical cells in `TASK/09` **or** produce **signed waiver** that PROD F + E2E supersede for launch subset.

**Accept**
- [ ] Waiver or cells closed
- [ ] No claim of full-cutover without KEY-51

---

#### KEY-51 — Launch gate decision (full-cutover vs launch-subset)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human product |
| Depends | KEY-50 |
| Type | decision |

**Options**
1. **Launch-subset:** money + auth + seller finance + admin money read — GO with deferred list frozen.
2. **Full-cutover:** close G0–G8 + QLT-490 first.

**Accept**
- [ ] Written decision in evidence with date/owner
- [ ] Deferred list frozen

---

#### KEY-52 — Staging headed E2E re-run (no seed passwords in evidence)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | agent |
| Depends | KEY-22, KEY-20 |
| Type | qa |

**Do**
- Re-run E2E-00..12 against staging FE+API with **staging operators** (not seed if prod-like).
- E2E-13 mock remains separate nonprod.

**Accept**
- [ ] STATUS board staging run pass/fail
- [ ] Evidence paths only

---

### K6 — Human sign + LIVE canary

#### KEY-60 — Residual risk human signatures (G30)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human |
| Depends | KEY-01, KEY-51 |
| Type | sign-off |

**Do**
- Sign `residual-risks.md` (or dated waiver).
- Confirm RR-011..014 accepted/mitigated.

**Accept**
- [ ] Signatures present
- [ ] Open risks have owner+date

---

#### KEY-61 — Pre-flight LIVE checklist (no money yet)
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human + agent |
| Depends | KEY-10..42, KEY-60 |
| Type | checklist |

**Checklist**
- [ ] SM populated LIVE keys (not applied yet)
- [ ] Dashboard callback URLs ready for LIVE
- [ ] Rollback plan: flip `DUITKU_ENV`/`XENDIT_ENV` back + feature switches
- [ ] On-call + log access
- [ ] Canary amount + allowlisted merchant/buyer

**Accept**
- [ ] Checklist 100% checked in evidence

---

#### KEY-62 — PROD-G40 Live money canary
| Field | Value |
|-------|--------|
| P | P0 |
| Owner | human (agent only after GO) |
| Depends | KEY-61 + explicit message **`GO LIVE CANARY`** |
| Type | live |

**Do (only after GO)**
1. Apply LIVE keys via SM (key-swap).
2. Small Duitku LIVE pay → PAID → settlement ×1 → replay safe.
3. Optional: small Xendit LIVE WD.
4. Go / no-go written.

**Accept**
- [ ] Evidence with amounts + intent ids (no secrets)
- [ ] No double settlement
- [ ] Rollback tested or documented

**Agent ban:** tanpa `GO LIVE CANARY` → status tetap `blocked`.

---

### K7 — Post-canary

#### KEY-70 — Post-canary browser smoke (allowlist tenants)
| Field | Value |
|-------|--------|
| P | P1 |
| Owner | agent |
| Depends | KEY-62 GO |
| Type | qa |

**Do**
- E2E-05/06/07/08 against LIVE canary tenants only.
- No seed passwords in prod.

**Accept**
- [ ] Pass or residual filed

---

#### KEY-71 — Production watch window (24–72h)
| Field | Value |
|-------|--------|
| P | P1 |
| Owner | human on-call |
| Depends | KEY-62 |
| Type | ops |

**Do**
- Monitor webhook errors, settlement mismatches, 5xx, mail bounce.
- Daily note in evidence.

**Accept**
- [ ] Window closed with go/no-go for general open

---

## 4. Dependency graph (critical path)

```text
KEY-00
  ├─ KEY-01, KEY-02
  └─ KEY-10 ─┬─ KEY-11 ─┐
             ├─ KEY-12 ─┼─ KEY-21 ─ KEY-22 ─┬─ KEY-30/31/32/33
             ├─ KEY-13 ─┤                  ├─ KEY-40/41/(42)
             └─ KEY-14 ─┘                  ├─ KEY-20/23
                                           ├─ KEY-50 → KEY-51 → KEY-52
                                           └─ KEY-60 → KEY-61 → KEY-62
                                                         └─ KEY-70/71
```

---

## 5. Env that is pure “key-swap” at KEY-62

| Variable | Pre-canary | At GO |
|----------|------------|-------|
| `DUITKU_ENV` | `sandbox` | `production` |
| `DUITKU_API_KEY` / merchant | sandbox SM | **live SM** |
| `XENDIT_ENV` | `sandbox` | `production` |
| `XENDIT_SECRET_KEY` / webhook token | sandbox SM | **live SM** |
| Dashboard callback | already HTTPS staging | same path, live merchant |

**Must already be correct before swap (bukan key-swap):**  
`APP_ENV=production`, `PAYMENT_PROVIDER=duitku`, `DISBURSEMENT_PROVIDER=xendit`, `MAIL_MODE=smtp`, R2, encrypt keys, FE `DATA_SOURCE=api` + `APP_STAGE=live`, no fake providers.

---

## 6. Agent rules

1. Claim one KEY-* at a time on [`13-KEYSWAP-STATUS.md`](13-KEYSWAP-STATUS.md).
2. Evidence under `TASK/PROD/evidence/KEY-xx/`.
3. **Never** put secrets in evidence.
4. **Never** run KEY-62 without human `GO LIVE CANARY`.
5. UI freeze remains (`TASK/00-UI-FREEZE-CONTRACT.md`).
6. Prefer config/ops over redesign.

---

## 7. Definition of done (key-swap program)

Program **key-swap ready** when:

1. KEY-10..42 done (ops + staging parity + dashboards).  
2. KEY-30/31 fail-closed verified.  
3. KEY-50/51 launch decision signed.  
4. KEY-60 residual signed.  
5. KEY-61 pre-flight 100%.  
6. Only remaining action for money is KEY-62 key apply + small canary.

Program **full live** when KEY-62 + KEY-70/71 also done.
