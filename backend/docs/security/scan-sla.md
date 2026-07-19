# Security scan remediation SLA (BE-610)

## Scopes

| Scan type | Tool (in-repo) | When |
| --------- | -------------- | ---- |
| SAST / static | `go vet ./...` | Every PR / `security_scan.sh` |
| Dependency vulns | `govulncheck ./...` when installed | Every release candidate + weekly |
| Secrets | gitleaks if installed; else ripgrep pattern scan | Every PR / release |
| Container image | Syft SBOM + Grype (`scripts/security/image-scan.sh`); fail on critical | Every image publish + backend-docker CI |
| npm SCA | `scripts/security/npm-audit-gate.mjs` (critical/high block; moderate waiver) | Every frontend PR |
| IaC / compose | `scripts/security/iac-scan.sh` (digest pins, privileged, secrets) | Every image CI + release |
| Authz/security functional | Integration negative matrix | Every PR with backend changes |

Command: `sh backend/scripts/security_scan.sh` (from repo root or `backend/`).

## Severity definitions

| Severity | Definition (examples) |
| -------- | --------------------- |
| Critical | Remote code exec, auth bypass, secret in repo, SSRF to cloud metadata in default config, ledger theft path |
| High | Privilege escalation, cross-tenant data read, missing CSRF on cookie mutations, raw credential disclosure |
| Medium | DoS without auth, incomplete logging of security events, dependency with limited exploit path |
| Low | Hardening gaps, informational SAST, outdated transitive dep without known exploit |

## Remediation SLA (calendar days from detection)

| Severity | Production exposed | Staging / pre-prod only | Notes |
| -------- | ------------------ | ----------------------- | ----- |
| Critical | **24 hours** mitigate or rollback | **3 days** | Hotfix or feature flag; incident if live money |
| High | **7 days** | **14 days** | May accept residual only with security owner sign-off |
| Medium | **30 days** | **45 days** | Track in backlog with owner |
| Low | **90 days** | Best effort | Batch in hardening sprints |

If SLA cannot be met: open/update entry in `residual-risks.md` with owner signature and compensating controls.

## Ownership

| Finding class | Primary owner | Escalation |
| ------------- | ------------- | ---------- |
| Auth / session / CSRF / impersonation | Security owner | Engineering lead |
| Payments / ledger / withdrawal | Payments engineering | Finance + security |
| Dependency / govulncheck | Engineering | Security if critical |
| Secrets in git | Security + engineering | Immediate revoke + rotate |
| Image base CVE | Platform/engineering | Security if critical |

## Release gate (BE-610 / BE-630)

1. `security_scan.sh` exit 0 **or** all non-zero findings documented as Accepted residuals. 
2. No **unresolved** critical/high without residual-risks signature. 
3. Negative security tests green. 
4. Image rebuild if scan reports critical base CVE on published tag.

## Image scan note

Runtime images: multi-stage `backend/Dockerfile` (`api` / `worker` targets), non-root UID **65532**, no secrets baked.
Base images pinned by digest (`docs/security/base-image-digests.md`).

```bash
./scripts/security/image-scan.sh fersaku-api:<tag> fersaku-worker:<tag> fersaku-frontend:<tag>
./scripts/security/iac-scan.sh
REQUIRE_SIGNATURE=1 ./scripts/security/verify-provenance.sh release/dist/release-manifest.json
```

CI: `backend-docker` job runs SBOM/Grype; `release.yml` attaches SBOM + signs with cosign on publish; production promotion rejects unsigned manifests.
