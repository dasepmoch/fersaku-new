# P1 — Tutup dependency, image, dan provenance gap

## Bukti temuan

- `npm audit --audit-level=low` menemukan moderate advisory pada `next@16.2.10` melalui `postcss@8.4.31` (XSS advisory); CI hanya memakai `--audit-level=high`.
- Docker/compose memakai mutable tags seperti `golang:1.25-alpine`, `alpine:3.21`, `postgres:16-alpine`, dan `redis:7-alpine`; docs mengakui image scan CI belum wired.
- `backend/scripts/security_scan.sh` lulus vet/govulncheck/secret pattern, tetapi tidak menggantikan image CVE/SBOM/provenance scan.

## Langkah implementasi

1. Evaluasi patched supported Next/PostCSS path; jangan menerima `npm audit fix` yang downgrade major tanpa compatibility review. Record advisory decision and expiry.
2. Tambahkan lockfile/package policy, `npm audit` threshold yang disetujui, OSV/SCA, dan review cadence. Moderate issue yang reachable di production harus ada mitigation atau waiver ber-owner.
3. Pin base/runtime images by digest; update melalui bot/PR yang menjalankan tests. Pin GitHub Actions by SHA sesuai policy.
4. Generate SBOM untuk frontend/backend images, scan Trivy/Grype or equivalent, sign image and provenance, verify signature before deployment.
5. Scan IaC/compose/manifests for privileged mode, exposed ports, mutable tags, secret ENV, root user, and debug endpoints.
6. Publish artifact evidence: dependency lock hash, SBOM digest, CVE report, base image digest, signer, and approved exception expiry.

## Acceptance criteria

- CI blocks critical/high and has explicit owner/expiry for accepted moderate advisory.
- Production release references immutable digests and signed provenance; verifier rejects unsigned artifact.
- SBOM and scan reports attached to release manifest; no secret baked in image.
- Rebuild from same source/lockfile is reproducible enough to explain digest differences.

