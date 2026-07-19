# Production-readiness gap program

Status audit: 20 Juli 2026, source tree `/var/www/fersaku-new`.

## Verdict

Project belum layak langsung diarahkan ke production. Setidaknya terdapat lima blocker P0 yang harus ditutup sebelum menerima uang atau mengaktifkan seller upload: kontrak Duitku yang tidak sesuai API terkini, scanner malware production yang belum ada, trusted-proxy/rate-limit yang belum terhubung, quality gate CI yang merah, serta release/deployment yang belum menghasilkan artefak production yang dapat dipromosikan dan di-rollback. Legal copy, observability, capacity, supply-chain, backup drill, dan kebocoran fixture live adalah P1 yang wajib ditutup sebelum go-live penuh.

Credentials sengaja tidak diaudit sebagai isi/nilainya. Task di bawah hanya meminta validasi wiring, mode, fail-closed behavior, dan bukti tanpa menuliskan secret.

## Urutan pengerjaan

0. `00-AUDIT-REPORT.md` (snapshot evidence; tidak perlu dikerjakan)
1. `01-P0-DUITKU-CONTRACT.md`
2. `02-P0-MALWARE-SCAN.md`
3. `03-P0-PROXY-RATE-LIMIT.md`
4. `04-P0-QUALITY-GATES.md`
5. `05-P0-RELEASE-DEPLOYMENT.md`
6. `06-P1-CAPACITY-MIGRATION.md`
7. `07-P1-OBSERVABILITY.md`
8. `08-P1-LIVE-DATA-TRUTH.md`
9. `09-P1-LEGAL-PUBLIC-SURFACE.md`
10. `10-P1-SUPPLY-CHAIN.md`
11. `11-P1-DR-BACKUP-E2E.md`
12. `12-P1-READINESS-EVIDENCE.md`

P0 dikerjakan berurutan dan setiap task harus menghasilkan bukti yang dapat direview. P1 dapat paralel setelah desain provider dan release contract stabil. Jangan menyelesaikan task dengan mengganti status menjadi “done” tanpa command output, artifact, atau evidence link yang diminta.

## Temuan yang sengaja tidak menjadi task fitur

Google OAuth, foto profil, contact submission, API playground send, campaign backend, refund, dan domain yang memang sudah ditandai deferred bukan diminta untuk diimplementasikan. Agen hanya boleh memastikan affordance-nya disabled/hidden/jujur di mode live; jangan membangun fitur baru sebagai bagian audit ini.

## Aturan semua task

- Jangan commit credentials, token, cookie, payload KYC, payment body, atau URL secret.
- Tambahkan regression test sebelum mengubah adapter atau policy.
- Bukti staging/live harus memakai ID/order yang disanitasi dan amount yang aman.
- Source code tetap berubah hanya di branch agen yang mengerjakan task terkait; dokumen ini adalah backlog, bukan izin mengubah source pada audit awal.
- Setiap task wajib menyebut rollback, observability, dan owner handoff.
