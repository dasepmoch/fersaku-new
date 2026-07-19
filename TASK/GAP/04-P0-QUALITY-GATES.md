# P0 — Pulihkan seluruh quality gate sebelum release

## Bukti temuan audit

- `gofmt -l` mengembalikan puluhan file Go yang belum formatted; backend CI memiliki gofmt check.
- `go test -count=1 ./...` dan `go test -race ./...` gagal di architecture boundary karena `backend/internal/application/withdrawal_service_test.go` mengimpor adapter `internal/adapters/xendit`.
- Frontend `npm run format:check` gagal pada 263 tracked source files; tidak ada `.prettierignore` yang mencegah generated `.next-*` ikut discan.
- Source-only ESLint masih menghasilkan 48 errors dan 20 warnings; CI memakai `--max-warnings=0`. Ada hook-name false positive, setState-in-effect, impure render (`Date.now`), dan ref write during render.
- Sequential `npm run typecheck` gagal pada `frontend/tests/e2e/api/qlt-220-parent-framework.spec.ts:95` (`repoPath` tidak didefinisikan).
- `npm run test:coverage` gagal tiga test: architecture-boundary regex stale, buyer-session clock nondeterministic, dan int-170 regex false-positive.

## Langkah implementasi

1. Pisahkan formatting source dari generated/artifact directories dan tambahkan ignore yang eksplisit untuk `.next`, `.next-dev`, `.next-e2e-api`, reports, coverage, dan temp.
2. Jalankan formatter hanya pada file yang memang berubah/ditetapkan; review diff agar tidak menimpa perubahan user yang tidak terkait.
3. Hapus import adapter dari application test memakai fake/port test double; architecture test harus tetap menutup dependency rule.
4. Perbaiki lint dengan keputusan scoped: rename predicate yang bukan React hook, atau konfigurasi rule secara sempit. Perbaiki actual effect/render purity tanpa mematikan rule global.
5. Perbaiki `repoPath` typecheck dan jalankan typecheck pada clean checkout setelah build tidak berjalan paralel.
6. Ganti static regex tests dengan parser/scoped assertions; inject clock ke mapper test; pastikan test tidak bergantung pada tanggal aktual.
7. Jalankan backend unit/race, frontend format/lint/typecheck/coverage/build/bundle, dan API/mock E2E dalam environment bersih. Jangan menerima hasil dari working tree yang memiliki generated residue.

## Acceptance criteria

- Semua required CI job hijau dari clean checkout, tanpa `continue-on-error`, skip-only suite, atau local artifact dependency.
- `gofmt -l` kosong; `go vet`, `go test ./...`, dan `go test -race ./...` hijau.
- `npm run format:check`, source lint `--max-warnings=0`, typecheck, coverage, build, bundle budget hijau.
- Test output menyimpan jumlah test, skipped, failure, commit SHA, runtime versions.
- Perubahan test tidak menghapus security/architecture assertion; setiap suppression punya alasan dan scope minimal.

