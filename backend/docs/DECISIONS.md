# Backend architecture decision records

Index of accepted product/architecture decisions for the Fersaku Go backend. 
Source of truth for irreversible money/auth/schema choices: `docs/BACKEND_PRODUCTION_TASKS.md` (esp. §0, §14.5, §15 BE-000, §16, §18), `docs/BACKEND_HANDOFF.md`, `ARCHITECTURE.md`.

| ADR | Title | Status | Date |
| --- | ----- | ------ | ---- |
| [ADR-0001](adr/ADR-0001-modular-monolith.md) | Modular monolith (api + worker), PostgreSQL authority, Redis non-authoritative, R2 private-by-default | Accepted | 2026-07-16 |
| [ADR-0002](adr/ADR-0002-one-xendit-account.md) | One Xendit account for QRIS payment + disbursement; no Duitku/failover | Accepted | 2026-07-16 |
| [ADR-0003](adr/ADR-0003-launch-fee-policy.md) | Launch fee policy `LAUNCH_FEE_POLICY_V1` immutable; future change needs new ADR + versioned release | Accepted | 2026-07-16 |
| [ADR-0004](adr/ADR-0004-session-auth-impersonation.md) | Session / auth / impersonation policy and retention owners | Accepted | 2026-07-16 |
| [ADR-0005](adr/ADR-0005-non-goals.md) | Non-goals: no-refund / no-dispute / no-recon-console / no-product-gateway-API / no-subscription | Accepted | 2026-07-16 |
| [ADR-0006](adr/ADR-0006-free-features.md) | Free features only; delivery authorization ≠ paid plan | Accepted | 2026-07-16 |
| [ADR-0007](adr/ADR-0007-production-runtime-topology.md) | Production runtime/topology, `payment_mode`, canonical store, fee basis min/max | Accepted | 2026-07-16 |

All ADRs above are **Accepted** as of BE-000 completion. Do not reopen locked decisions; amend only via a new ADR + versioned release when product/security requires it.

Next implementation task: **BE-002** — Docker/local/CI foundation.
