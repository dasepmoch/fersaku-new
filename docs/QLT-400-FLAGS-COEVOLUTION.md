# QLT-400 — Per-domain flags, canary, kill switch (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-400 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-400`** | Typed domain registry principles registered (mock | api | disabled), production mock rejection, emergency kill switch + audit shape, canary/allowlist precedence, hydration parity, cache cleanup on source change, parent assert + CI suite `qlt-400-flags`, continuous co-evolution rule. **Not** every rollout stage or §3.7 `QLT-400 flag` cell. |
| **Capability cell** (`09` §3.7 column `QLT-400 flag`) | Domain-specific activation/canary evidence before that capability goes live. |

Parent must never wait on descendant cells. Domain tasks wire adapters through `getDomainSource` / `withDomainSource` and claim §3.7 cells when canary-ready.

**Production never falls back to mock business data when a flag is off** — residual mock on live rewrites to `disabled` (existing error/disabled UX), never fixtures.

**Do not invent** production canary percentages, live kill-switch firings, or full-matrix rollout stage evidence. Those are cell/ops work when claimed.

## Categories (parent registration)

| Category | Scope | Parent sample anchors |
| --- | --- | --- |
| **Typed registry** | One server-owned registry (INT-025); effective values only mock | api | disabled; adapters use typed accessors; no global `isLiveApi()` turning all domains on | `shared/data/domain-source.ts`, `shared/data/domain-source-provider.tsx`, `tests/unit/domain-source.test.ts`, `tests/unit/architecture-boundaries.test.ts` |
| **Production mock rejection** | Live/production rejects mock at evaluate/install; disabled never network-falls-back to fixtures | `evaluateDomainSources` + `assertProductionDomainSources` + install guard in `domain-source.ts`; unit samples in `domain-source.test.ts` |
| **Emergency kill switch** | Server-side control with version, actor, reason, audit, optional expiry, propagation SLO; build-time env is bootstrap only | `shared/data/domain-flags.ts` (`EmergencyKillSwitch`, `buildEmergencyAuditEvent`, `readServerOwnedEmergencyControls`, `DEFAULT_KILL_SWITCH_PROPAGATION_SLO_MS`) |
| **Canary / allowlist** | Precedence: emergency → canary/allowlist → server overrides → bootstrap; opaque subject keys only | `evaluateDomainFlags`, `resolveCanarySource`, `canaryBucket`, `readServerOwnedCanary` in `domain-flags.ts` |
| **Hydration parity** | SSR + client install the same public-safe snapshot; mismatch is config error, not temporary mock | `DomainSourceProvider`, `installDomainSourceSnapshot`, `toPublicDomainSourceSnapshot` |
| **Cache cleanup** | Query keys may include source/version segment; on source change cancel + remove domain caches before new fetch | `purgeDomainCachesOnSourceChange`, `applyDomainSourceChange`, `domainSourceKeySegment`, `DOMAIN_QUERY_ROOTS`; policy note in `shared/query/QUERY-MUTATION-POLICY.md` |
| **Telemetry (public-safe)** | domain, effective source, config version, release — no raw user/tenant | `buildDomainSourceTelemetry` in `domain-flags.ts` |

## Precedence (required)

```text
emergency kill (active)  >  canary/allowlist  >  DOMAIN_SOURCE_OVERRIDES  >  bootstrap (NEXT_PUBLIC_DATA_SOURCE)
```

Then live `rejectMock`: any residual `mock` → `disabled` (never fixtures for production users).

## Continuous co-evolution rule (domain tasks)

When a domain task adds or changes feature adapters, query keys for API-mode data, or rollout readiness:

1. **Use the registry** — `getDomainSource` / `shouldUseMockFixtures` / `withDomainSource`; never ad-hoc `process.env` or `isLiveApi()` in screens/hooks.
2. **No production mock** — API branch must not import mock/fixture business data; flag off → disabled/error UX only.
3. **Same PR** — if source can change at runtime, purge domain caches via QLT-400 helpers; include source/version in keys when payload shape depends on source.
4. **Telemetry** — report domain + source + config version + release without raw tenant/user ids.
5. **Emergency** — kill switches stay server-owned (`DOMAIN_SOURCE_EMERGENCY` / ops pipeline); build-time public env is not an emergency control.
6. **CI** — keep `scripts/ci-assert-suite.mjs qlt-400-flags` green.
7. **Mark capability cell** in `09` §3.7 when domain canary/activation is proven — leave parent alone.

## Recommended rollout sequence (cells, not parent)

Documented in `07` §QLT-400: catalog → auth → checkout canary → buyer → seller read → seller mutations → finance → admin read → admin mutations → global API default. Parent registers the sequence; stage go/no-go is §3.7 / ops.

## Harness locations

| Role | Path |
| --- | --- |
| Co-evolution rule (this doc) | `docs/QLT-400-FLAGS-COEVOLUTION.md` |
| Parent framework assert (unit/fs) | `tests/unit/qlt-400-parent-framework.test.ts` |
| Typed registry (INT-025) | `shared/data/domain-source.ts`, `domain-source-provider.tsx` |
| Flags / canary / kill / cache | `shared/data/domain-flags.ts` |
| INT-025 unit samples | `tests/unit/domain-source.test.ts` |
| QLT-400 unit samples | `tests/unit/domain-flags.test.ts` |
| Architecture (no mock in API branch / no ad-hoc flags) | `tests/unit/architecture-boundaries.test.ts` |
| Query policy note | `shared/query/QUERY-MUTATION-POLICY.md` |
| Parent CI suite id | `scripts/ci-assert-suite.mjs` → `qlt-400-flags` |
| npm assert | `package.json` → `ci:assert:flags` |
| Frontend CI step | `.github/workflows/ci.yml` → `frontend-static` (assert suites) |

## Local / CI recipe (repeatable)

```bash
# Parent suite guards (no stack required)
node scripts/ci-assert-suite.mjs qlt-400-flags

# FE unit samples (flags-related)
./node_modules/.bin/vitest run \
  tests/unit/qlt-400-parent-framework.test.ts \
  tests/unit/domain-source.test.ts \
  tests/unit/domain-flags.test.ts \
  tests/unit/architecture-boundaries.test.ts
```

## Acceptance (parent only)

- Categories above are registered in this doc and enforced by parent assert + `qlt-400-flags` suite.
- Required samples remain non-empty: INT-025 domain-source + provider + tests; domain-flags (precedence, kill switch, cache purge, telemetry); architecture-boundaries mock/API gate.
- Production never falls back to mock business data when flag off (rewrite + assert + disabled throws).
- CI fails if parent samples or co-evolution doc regress.
- Domain matrix cells in §3.7 and full rollout stages remain separate work; parent `[x]` does **not** complete every stage or §3.7 QLT-400 cell.
