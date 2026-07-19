# P1 — Selaraskan connection budget dan jadikan migration production-safe

## Bukti temuan

- `backend/internal/adapters/postgres/pool.go:28-37` default `MaxConns=20`.
- `backend/internal/app/app.go:269` memakai config yang sama tanpa API/worker env override.
- `backend/docs/launch/topology.md` menghitung API 20, worker 10, dua replica masing-masing, migrate 4 = 64/80, tetapi runtime aktual dua worker juga 20 sehingga 84/80 sebelum admin/HA headroom.
- `backend/scripts/migrate.sh` menyediakan `down`, `drop`, `force`, dan `goto` tanpa guard production/explicit confirmation.
- `launch_bootstrap.sh` default menjalankan seed dan tidak memiliki mode production-safe yang tegas selain operator mengingat `SKIP_SEED=1`.

## Langkah implementasi

1. Definisikan pool budget per process role dan replica count dari satu sumber config. Fail startup bila total theoretical + headroom melampaui DB max connections.
2. Tambahkan env knobs tervalidasi untuk API/worker/migrate/admin, timeout, statement timeout, and pool metrics. Jangan mengandalkan default 20 untuk semua role.
3. Tambahkan guard migration: destructive commands ditolak jika `APP_ENV=production` kecuali explicit break-glass token/interactive confirmation yang tidak bisa aktif di CI. `up` adalah default forward-only.
4. Lock migration execution ke satu job, verifikasi backup/PITR checkpoint, migration version, lock timeout, and expand/contract compatibility sebelum rollout.
5. Pisahkan bootstrap local/staging/prod; production tidak boleh seed demo personas atau memakai local DATABASE_URL fallback.
6. Uji concurrent migrate, failed migration, restart, pool exhaustion, long transaction, and rollback image against previous schema.

## Acceptance criteria

- Capacity worksheet sama dengan runtime config untuk jumlah replica production dan menyisakan headroom terukur.
- Production migration script tidak bisa `drop/down/force/goto` secara accidental; CI masih bisa menguji command di disposable DB.
- No local default URL/seed path pada production; audit log migration menyimpan version, actor/job, duration, and result.
- Integration test membuktikan app lama tetap jalan setelah expand migration dan app baru tidak deploy sebelum head migration.

