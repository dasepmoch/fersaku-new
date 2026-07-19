# Supply-chain policy (GAP-10 / P1)

**Purpose:** Lockfile, dependency audit, base-image, SBOM, signing, and exception rules for production releases.

## Package / lockfile policy

| Rule | Detail |
| ---- | ------ |
| Lockfiles required | `frontend/package-lock.json` (npm lockfileVersion 3), `backend/go.sum` |
| Install in CI | `npm ci` only (no `npm install` on CI); Go uses `go mod download` from `go.mod`/`go.sum` |
| No major force-fix | Do **not** run `npm audit fix --force` or accept major downgrades without a compatibility review PR |
| Overrides | Allowed only when documented (e.g. `postcss` pin to clear nested Next advisory) |
| Review cadence | Dependency + base-image review at least **every 14 days** or before each production tag |

## npm audit threshold

| Severity | CI gate | Exception path |
| -------- | ------- | -------------- |
| Critical | **Block** | Residual entry + security owner + expiry ≤ 7 days |
| High | **Block** | Residual entry + security owner + expiry ≤ 14 days |
| Moderate | **Block unless waived** | Entry in `docs/security/npm-advisory-exceptions.json` with owner + `expiresAt` |
| Low | Report | Track in backlog; no gate fail |

Commands:

```bash
# Fail on critical/high always
npm audit --audit-level=high

# Moderate: allow only IDs listed in npm-advisory-exceptions.json (not expired)
node scripts/security/npm-audit-gate.mjs
```

## Go dependency scan

- `govulncheck ./...` in `backend/scripts/security_scan.sh` (fail on known vulns).
- Optional OSV: `scripts/security/osv-scan.sh` when `osv-scanner` is installed.

## Container images

| Rule | Detail |
| ---- | ------ |
| Base pins | Dockerfiles and compose **must** reference `name:tag@sha256:…` (see `docs/security/base-image-digests.md`) |
| Update path | PR that bumps digest + runs unit/build gates (bot or human) |
| Runtime user | Non-root (UID 65532) for app images |
| Secrets | Never `ENV`/`ARG` secrets into layers; runtime inject only |
| SBOM | Syft SPDX JSON per image under `release/dist/sbom/` |
| CVE scan | Grype (or Trivy) fail on **critical**; high tracked to SLA |
| Sign | Cosign keyless (OIDC) on publish; production verifier **rejects unsigned** when `REQUIRE_SIGNATURE=1` |

## GitHub Actions

- Pin third-party actions by **commit SHA** with version comment (`uses: org/action@<sha> # vX.Y`).
- Prefer official `actions/*` and `docker/*` only unless security-reviewed.

## IaC / compose hygiene

Scan compose/Dockerfiles for: `privileged: true`, host network, mutable unpinned tags, secret-like ENV defaults, root user without justification, debug ports on production overlays.

```bash
./scripts/security/iac-scan.sh
```

## Artifact evidence (release)

Each release manifest should record or attach:

1. Lockfile hashes (`package-lock.json`, `go.sum`)
2. Base image digests used at build
3. App image digests (api/worker/frontend)
4. SBOM digests / paths
5. CVE scan report paths
6. Cosign / attestation references
7. Approved exception expiry (if any moderate advisory)

## Related files

- `docs/security/npm-advisory-exceptions.json` — moderate waivers
- `docs/security/base-image-digests.md` — pin inventory
- `backend/docs/security/scan-sla.md` — remediation SLA
- `backend/docs/security/residual-risks.md` — accepted residuals
- `scripts/security/*` — gates and scanners
