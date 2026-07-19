# P0 — Perbaiki trusted proxy dan rate-limit production

## Bukti temuan

- `backend/internal/adapters/http/router.go:108-109,150` memiliki `TrustedProxies`, tetapi `backend/internal/app/app.go:997-1040` tidak mengisi field tersebut dari config.
- `backend/internal/adapters/http/middleware/trusted_proxy.go:12-20,37-65` hanya mempercayai XFF bila peer masuk CIDR; tanpa CIDR memakai `RemoteAddr`.
- Redis limiter memakai prefix `rl:ip:` dan default 120/min (`backend/internal/adapters/redis/limiter.go:21-39,54-75`).
- Router menerapkan rate limit sebagai middleware global (`router.go:145-172`), sehingga health, auth, checkout, provider callback, admin, dan webhook memakai budget yang sama.

## Risiko

Di belakang load balancer seluruh pengguna dapat terlihat sebagai satu IP LB dan saling menghabiskan 120 request/minute. Login, checkout, callback, atau health bisa mengalami 429 massal. Jika XFF dipercaya terlalu luas, attacker dapat mem-bypass limit dengan spoof header.

## Langkah implementasi

1. Tambahkan config `TRUSTED_PROXY_CIDRS`/equivalent yang tervalidasi ketat saat boot production; parsing invalid/empty pada topology LB wajib fail atau explicit direct mode.
2. Isi `RouterDeps.TrustedProxies` dari config dan expose resolved peer policy di safe diagnostics (tanpa header mentah).
3. Tambahkan unit tests direct client, trusted LB, spoofed XFF from untrusted peer, multi-hop XFF, IPv4/IPv6, malformed RemoteAddr.
4. Pisahkan rate-limit budget per route class: public read, auth, mutation/checkout, admin, provider callback, health/metrics. Callback harus tetap terlindung dari abuse tetapi tidak berbagi bucket dengan traffic user.
5. Tentukan key strategy: resolved client IP plus route class, dan bila authenticated gunakan subject/store scope sesuai threat model. Jangan memakai raw user-controlled header sebagai key.
6. Tetapkan policy saat Redis unavailable per class; health/readiness harus dapat menjelaskan degraded state dan money mutations tidak boleh diam-diam unlimited.
7. Uji dua replica di belakang proxy nyata/stub dengan 20 client IP berbeda, burst, retry-after, callback storm, dan Redis failover.

## Acceptance criteria

- Production startup menunjukkan trusted proxy CIDR resolved dan test membuktikan IP asli digunakan hanya dari peer tepercaya.
- Dua client di belakang LB tidak berbagi bucket; spoof XFF tidak mengubah identitas.
- Route callback/auth/checkout memiliki limit dan retry-after yang terdokumentasi; health tidak ikut terkunci oleh traffic biasa.
- Redis error policy teruji dan alert muncul sebelum user-visible outage.
- Log/metric memuat route class dan hashed/bounded client identity, bukan PII/header mentah.

