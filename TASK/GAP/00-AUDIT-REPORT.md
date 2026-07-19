# Audit report — current state snapshot

Tanggal audit: 20 Juli 2026 (Asia/Jakarta). Audit read-only terhadap source/config/docs/tests; tidak ada source code yang diubah oleh audit ini. File yang dibuat hanya paket backlog di `TASK/GAP/`.

## Hasil pemeriksaan

| Area | Hasil | Makna production |
|---|---|---|
| Backend formatting | FAIL — `gofmt -l` mengembalikan banyak file | CI backend akan merah |
| Backend unit | FAIL — architecture boundary test menganggap `application/withdrawal_service_test.go` mengimpor adapter Xendit | Release gate merah; test architecture dilanggar |
| Backend race | FAIL pada failure yang sama | Tidak ada bukti race gate hijau |
| Backend vet/vulnerability/secret scan | PASS untuk `go vet`, `govulncheck`, pattern secret scan | Tidak menggantikan image/SBOM scan |
| Frontend format | FAIL — 263 tracked source files | CI frontend static merah |
| Frontend lint | FAIL — 48 errors + 20 warnings pada source-only run; CI `--max-warnings=0` | Hook naming dan actual React purity errors memblokir |
| Frontend typecheck | FAIL — `repoPath` undefined di API E2E parent test | Release gate merah |
| Frontend coverage | FAIL — 3 test files/test assertions | Clock/regex/static test tidak deterministic |
| Frontend build/bundle budget | PASS — build selesai, 66 pages/161 chunks, budget pass | Tidak membuktikan runtime/payment readiness |
| Dependency audit | 2 moderate Next/PostCSS advisories pada low threshold; CI hanya high | Moderate supply-chain exposure tidak terdeteksi gate |
| Production upload | FAIL by design | Object completion selalu ditolak tanpa scanner |
| Production KYC scan | FAIL security posture | Heuristic EICAR check ditandai passed sebagai `heuristic_pass` |
| Trusted proxy | FAIL wiring | `TrustedProxies` ada di router tetapi tidak dipopulasi app config |
| Rate limit | FAIL topology policy | Satu global Redis IP bucket 120/min; LB dapat menggabungkan seluruh user |
| Payment Duitku | FAIL contract | MD5 lama, sandbox default, wrong lookup identifier, callback ack belum diverifikasi |
| Observability | INCOMPLETE | OTEL endpoint/no-op frontend reporter belum wired ke sink |
| Release/deploy | INCOMPLETE | Tidak ada build-once promotion/CD/immutable frontend deployment contract |
| Managed DR | PENDING owner | Local restore ada; managed HA/PITR drill belum terbukti |
| Legal | FAIL launch hygiene | Privacy/terms secara eksplisit menyebut placeholder |

## Temuan tambahan yang diperiksa

- Frontend admin Users live branch menggunakan `demoSellerUsers()` di kedua branch; data seller/impersonation dapat palsu.
- Default Postgres pool 20 dipakai API dan worker; angka tersebut tidak cocok dengan connection budget di topology docs.
- Migration script menyediakan perintah destructive tanpa production guard; bootstrap seed bergantung pada operator mengingat `SKIP_SEED=1`.
- Compose/Docker/Actions menggunakan mutable tags; image scan, SBOM, signing, dan digest verification belum menjadi gate.
- Existing production docs mengandung klaim “done/pass” yang bertentangan dengan current test failures, scanner absence, stale-image/404 evidence, dan managed infra pending.

## Sumber provider yang diverifikasi

Dokumentasi resmi Duitku yang diakses saat audit menyatakan HMAC-SHA256 untuk request inquiry, callback, dan transaction status, production host `passport.duitku.com`, serta merchant `merchantOrderId` sebagai ID transaksi merchant. Source saat ini memakai MD5 dan menyamakan provider `reference` dengan merchant order pada lookup. Agen yang mengerjakan `01-P0-DUITKU-CONTRACT.md` wajib menyimpan URL/version/date verifikasi dan menyesuaikan bila provider merilis perubahan baru.

## Batasan audit

- Nilai credentials/secret sengaja tidak dibaca atau ditulis.
- Tidak menjalankan migration, seed, `docker compose down -v`, live payment, live payout, atau operasi destruktif terhadap database/object storage.
- Tidak menganggap dokumen/runbook sebagai bukti runtime bila tidak ada command output/artifact.
- Deferred feature bukan gap implementasi dalam backlog ini; yang dinilai hanya apakah surface live jujur dan fail-closed.

