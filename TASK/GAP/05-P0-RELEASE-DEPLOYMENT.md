# P0 — Jadikan release dan deployment dapat dipromosikan/di-rollback

## Bukti temuan

- Repository hanya memiliki backend Dockerfile dan compose rehearsal; tidak ada artefak deployment frontend production, manifest platform aktual, atau CD/promotion workflow.
- CI membangun image, tetapi belum membuktikan publication immutable, digest promotion, signature/provenance, SBOM, atau automatic migrate/deploy/rollback.
- Runbook `backend/docs/launch/topology.md` dan `canary-rollback.md` adalah prosedur, bukan executable deployment contract; evidence live sendiri menyatakan managed infra/canary masih owner-pending.

## Risiko

Build hijau tidak berarti artifact yang dideploy sama dengan yang diuji. Tidak ada cara deterministik untuk mempromosikan staging ke prod atau mengembalikan API/worker/frontend bersama-sama. Schema/image mismatch dapat merusak money flows.

## Langkah implementasi

1. Tetapkan release manifest berisi git SHA, image digest API/worker/frontend, migration head, Node/Go versions, base image digest, feature/domain source map, dan config schema version.
2. Buat pipeline build-once: test → SBOM/vulnerability scan → sign provenance → publish immutable digest → deploy staging → smoke/E2E → manual production approval → canary → promote.
3. Sediakan artefak frontend yang benar-benar dijalankan di target (standalone Node/container atau platform contract), termasuk health endpoint, cache/static policy, env build-time vs runtime, dan source map policy.
4. Pisahkan migration job dari API/worker boot. Gate rollout pada migration success, readiness, synthetic, callback ingress, scanner, storage, mail, and queue checks.
5. Implementasikan canary/rollback command yang memilih previous digest; schema strategy forward-compatible dan tidak auto-down-migrate.
6. Tambahkan deployment smoke yang membuktikan callback routes tidak 404 pada image yang benar-benar dipublish, bukan hanya source tree.

## Acceptance criteria

- Satu release manifest dapat diambil ulang dan memetakan artifact yang dites ke artifact yang dideploy.
- Staging dan production promotion tidak rebuild source berbeda; digest immutable diverifikasi.
- Canary satu slice punya rollback teruji untuk API, worker, dan frontend; rollback selesai tanpa kehilangan outbox/payment state.
- Migration failure menghentikan rollout; readiness gagal jika dependency wajib belum siap.
- Evidence menyimpan digest, health/synthetic result, migration version, deploy time, rollback drill, dan reviewer.

