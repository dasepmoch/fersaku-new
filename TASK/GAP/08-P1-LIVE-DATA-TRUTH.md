# P1 — Pastikan mode live tidak menampilkan fixture atau affordance palsu

## Bukti temuan

- `frontend/features/admin/screens/access/users.tsx:25-30` memiliki branch identik `isMock ? demoSellerUsers() : demoSellerUsers()`. Mode API tetap menampilkan seller demo, email, ID, dan tombol “Open as user”.
- Screen yang sama memakai `useAdminStaffDirectory` untuk admin, tetapi tidak memakai API `listAdminUsers`/`useAdminUsers` yang tersedia di `features/admin/data/access.ts`.
- Banyak surface lain memiliki deferred/disabled affordance yang harus tetap jujur; static search menunjukkan “mock”, “placeholder”, dan “out of scope” pada public/admin pages.

## Risiko

Operator dapat mengambil keputusan dari data palsu atau mencoba impersonation ke ID fiktif. Public/admin UI terlihat live padahal sebagian domain disabled; ini merusak trust dan dapat memicu tindakan operasional yang salah.

## Langkah implementasi

1. Trace setiap screen privileged/public ke domain source snapshot. API/live harus hanya memakai server data atau menampilkan empty/degraded state yang eksplisit.
2. Hubungkan Users screen ke endpoint users lookup yang sudah tersedia; buat loading, empty, permission denied, stale, dan API error states. Impersonation hanya boleh memakai server-issued short-lived session + audit evidence.
3. Audit seluruh `demo*`, `mock*`, hardcoded metrics, fake IDs, “mock-admin-session”, and Date.now-generated mock values pada mode live. Tambahkan static guard yang scoped agar false positive tidak mengulang masalah INT-170.
4. Pastikan deferred features tidak memiliki button yang tampak aktif, tooltip/title yang hanya menjelaskan setelah hover, atau copy yang mengklaim data real. Jangan implement fitur deferred.
5. Add Playwright live-source smoke for admin users, dashboard, payments, KYC, storefront, buyer library, and contact/deferred pages.

## Acceptance criteria

- Tidak ada fixture row/metric/ID/email di rendered live/API output untuk semua domain yang dideklarasikan api/disabled.
- Users screen menampilkan hanya server lookup dan impersonation guard/audit yang valid; no fake target.
- Domain disabled menghasilkan state yang jelas, bukan network request atau fake success.
- Static and E2E checks dapat membedakan allowed mock fixtures pada mock-only tests dari production bundles.

