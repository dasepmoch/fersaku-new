# Base / runtime image digests (GAP-10)

Pinned digests as of **2026-07-20** (Asia/Jakarta audit host). Update via PR that rebuilds images and runs CI.

| Image | Tag | Digest |
| ----- | --- | ------ |
| golang | 1.25-alpine | `sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587` |
| alpine | 3.21 | `sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d` |
| node | 24-alpine | `sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd` |
| postgres | 16-alpine | `sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777` |
| redis | 7-alpine | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| minio/minio | RELEASE.2025-04-22T22-12-26Z | `sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e` |
| minio/mc | RELEASE.2025-04-16T18-13-26Z | `sha256:aead63c77f9db9107f1696fb08ecb0faeda23729cde94b0f663edf4fe09728e3` |
| axllent/mailpit | v1.22 | `sha256:f7f7c31de4de59540ad6515a0ca057a77525bca2069b6e747d873ca66c10fe08` |
| migrate/migrate | v4.18.3 | `sha256:39b59b389634e43bb3f2d4e94bc1edef0775ec2a9a3540ce6a2cf330e5daae55` |

## Dockerfile form

```dockerfile
FROM golang:1.25-alpine@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587 AS builder
FROM alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d AS runtime-base
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS deps
```

## Refresh procedure

1. `docker pull <image>:<tag>` and record new `RepoDigest`.
2. Update this file, Dockerfiles, compose, and CI service images.
3. Rebuild api/worker/frontend; run grype/syft via `scripts/security/image-scan.sh`.
4. Open PR; do not retag production without new release manifest digests.

## Reproducibility note

Rebuilds from the same source + lockfile + base digests should produce matching **application layer** content; residual digest drift may come from:

- BuildKit cache / non-reproducible timestamps in OS package install
- Registry multi-arch index vs single-platform Id
- Cosign attestation attachment (does not change image config digest)

Explain any digest difference in the release evidence file.
