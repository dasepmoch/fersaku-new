# Release & deployment contract (P0)

Executable promotion/rollback contract. Complements procedural runbooks
`topology.md` and `canary-rollback.md`.

## Principles

1. **Build once** — images built once per git SHA; staging and production promote the same digests.
2. **Immutable digests** — deploy by `repo@sha256:…`, never “rebuild same tag”.
3. **Release manifest** — single JSON maps git SHA → API/worker/frontend digests + migration head.
4. **Migrate job separate** — `scripts/release/migrate-job.sh` before any API/worker roll; API/worker never auto-migrate on boot.
5. **Forward-compatible schema** — no auto-down-migrate on rollback; money/outbox state preserved.
6. **Gates fail closed** — migrate failure, readiness failure, or callback 404 stops rollout.

## Artifacts

| Artifact | Path |
| -------- | ---- |
| Manifest schema | `release/schema/release-manifest.schema.json` |
| Domain source map | `release/feature-domain-source-map.json` |
| Generated manifest | `release/dist/release-manifest.json` |
| Frontend image | `frontend/Dockerfile` (standalone Node) |
| Frontend health | `GET /api/health` |
| Compose release overlay | `backend/docker-compose.release.yml` |
| CI | `.github/workflows/release.yml` |

## Commands

```bash
# 1) Generate manifest (after local builds, inject digests)
export API_DIGEST=sha256:... WORKER_DIGEST=sha256:... FRONTEND_DIGEST=sha256:...
./scripts/release/generate-manifest.sh
REQUIRE_DIGESTS=1 ./scripts/release/verify-manifest.sh release/dist/release-manifest.json

# 2) Migrate job (dedicated; abort deploy on failure)
EXPECTED_HEAD=$(node -pe 'require("./release/dist/release-manifest.json").migration.head')
DATABASE_URL=... APP_ENV=staging ./scripts/release/migrate-job.sh up

# 3) Roll images by digest (platform-specific). Rehearsal:
export FERSAKU_API_IMAGE=...@sha256:...
export FERSAKU_WORKER_IMAGE=...@sha256:...
export FERSAKU_FRONTEND_IMAGE=...@sha256:...
docker compose -f backend/docker-compose.yml -f backend/docker-compose.release.yml up -d

# 4) Gates + smoke (against running published stack)
API_BASE_URL=https://api.example ./scripts/release/deploy-gate.sh
API_BASE_URL=https://api.example MANIFEST=release/dist/release-manifest.json \
  ./scripts/release/deploy-smoke.sh

# 5) Canary / promote / rollback (digest only; no migrate down)
./scripts/release/canary-rollback.sh snapshot --manifest release/dist/release-manifest.json
./scripts/release/canary-rollback.sh canary --manifest release/dist/release-manifest.json
./scripts/release/canary-rollback.sh promote --manifest release/dist/release-manifest.json
./scripts/release/canary-rollback.sh rollback --previous release/dist/previous-manifest.json
```

## Pipeline (build-once)

```text
PR CI (existing) → release workflow:
  unit/typecheck
  → docker build api/worker/frontend
  → SBOM (Syft) + vuln scan (Grype critical)
  → cosign keyless (on publish)
  → release-manifest.json (gitSha + digests + migration head)
  → optional registry push
  → staging smoke (secret URL)
  → production environment approval
  → OWNER applies digests on managed runtime (BLOCKED without CD platform)
```

## Frontend production contract

| Concern | Policy |
| ------- | ------ |
| Runtime | Next.js `output: "standalone"` in container (`node server.js`) |
| Health | `GET /api/health` — process live only |
| Cache | Health: `no-store`. Static `_next/static` immutable hashed assets |
| Build-time env | `NEXT_PUBLIC_*` only (stage, data source, release id) |
| Runtime env | `API_INTERNAL_URL` for SSR + `/v1` rewrites (server-only) |
| Source maps | Off in production images unless `GENERATE_SOURCEMAPS=1` |

## Rollback

- Select **previous** manifest digests for API, worker, and frontend.
- Do **not** run `migrate down` automatically.
- Outbox / payment / ledger rows are not undone; code/flags only.
- Re-run `deploy-gate` + `deploy-smoke` + `synthetic_health` after rollback.

## Evidence fields (required)

| Field | Source |
| ----- | ------ |
| digests | release-manifest.json `images.*.digest` |
| health/synthetic | deploy-gate / synthetic_health output |
| migration version | `release/dist/evidence/migration-version.txt` |
| deploy time | evidence timestamps |
| rollback drill | `canary-rollback.sh` evidence files |
| reviewer | GitHub environment approval / owner sign-off |

## BLOCKED (owner / managed infra)

- Live registry credentials beyond GHCR token in Actions
- Managed LB canary weight percentages on production
- Automatic migrate/deploy into production cluster without owner CD
- PITR / multi-AZ apply (see DR tasks)

## References

- `docs/QLT-410-DEPLOY-ROLLBACK-COEVOLUTION.md`
- `backend/docs/launch/topology.md`
- `backend/docs/launch/canary-rollback.md`
- `TASK/GAP/05-P0-RELEASE-DEPLOYMENT.md`
