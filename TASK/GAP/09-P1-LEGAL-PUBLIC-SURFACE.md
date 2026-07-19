# P1 — Tutup legal placeholder dan public-surface contradictions

## Bukti temuan

- `frontend/app/(legal)/privacy/page.tsx:7` menyebut dokumen sebagai placeholder yang harus ditinjau penasihat hukum sebelum peluncuran.
- `frontend/app/(legal)/terms/page.tsx` description juga menyebut placeholder/non-legal advice.
- `frontend/app/(legal)/cookies/page.tsx` menyatakan implementasi production harus menyediakan consent, tetapi tidak membuktikan consent mechanism.
- `frontend/app/(company)/contact/page.tsx` menampilkan form dengan submit disabled karena backend sengaja deferred.

## Risiko

Meluncurkan halaman yang mengaku sebagai legal policy tetapi menyatakan placeholder adalah launch blocker trust/compliance. Cookie analytics tanpa consent policy dapat melanggar hukum/expectation. Contact form disabled terlihat seperti broken product.

## Langkah implementasi

1. Minta owner/legal mengesahkan privacy, terms, cookie, acceptable-use/prohibited-product, refund/no-refund, KYC/retention, payout/settlement, and support contact copy. Agen tidak mengarang legal advice.
2. Hapus kata placeholder setelah approval, tampilkan effective date/version, controller/entity, jurisdiction, contact, rights/request flow, processor categories, retention, international transfer, security caveat, and change notice sesuai legal decision.
3. Inventory analytics/marketing/essential cookies and storage. Gate non-essential collection behind consent; ensure withdrawal and default behavior documented.
4. Untuk contact deferred, jangan implement backend baru. Ubah affordance menjadi disabled/clearly unavailable dengan support channel yang benar atau sembunyikan route dari live navigation sesuai keputusan owner.
5. Tambahkan content smoke/static test yang menolak “placeholder”, “review before launch”, fake addresses, and development-only links in production build.

## Acceptance criteria

- Legal owner approval evidence/version tersedia dan halaman live tidak menyebut placeholder.
- Cookie behavior sesuai consent decision dan dapat diuji tanpa analytics credential.
- Contact/deferred surfaces tidak memberi kesan submit sukses; public navigation dan metadata konsisten.
- Link checker, accessibility, locale, and legal-content review tersimpan sebagai evidence.

