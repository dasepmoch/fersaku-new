# P0 — Selaraskan kontrak Duitku live dan identitas transaksi

## Bukti temuan

- `backend/internal/adapters/duitku/client.go:24-28,111-119,156-168,207-224` memakai default sandbox, MD5 untuk inquiry/status, serta mengirim `reference` hasil inquiry sebagai argumen `merchantOrderId` pada lookup berikutnya.
- `backend/internal/adapters/http/handlers/callbacks.go:96-98,143-151` memvalidasi callback dengan MD5 dan membalas `OK`.
- Duitku API Reference resmi saat audit mendeskripsikan HMAC-SHA256 untuk request inquiry, callback, dan transaction status; status production endpoint adalah `https://passport.duitku.com/...`. Dokumentasi juga meminta `SUCCESS` sebagai acknowledgement callback pada varian API terkait. Jangan mengandalkan fixture MD5 lama di test.
- Pada create, response `reference` adalah nomor Duitku; `merchantOrderId` adalah ID yang dibuat merchant. Checkout menyimpan `CreateQRISResult.ProviderReference` ke `payment_intents.provider_reference`, lalu `CheckoutService.LookupProvider` dan `ExpireIntent` memanggil `GetPayment` dengan nilai itu (`backend/internal/application/checkout_service.go:616-621,817-818,898-901`).

## Risiko

Inquiry live dapat ditolak signature, callback sah dapat ditolak, status reconciliation dapat selalu `not found`/auth failure, dan payment intent bisa tertahan `UNKNOWN_OUTCOME` tanpa fulfillment atau release reservation. Default sandbox yang lolos boot juga memungkinkan production mengirim transaksi ke lingkungan yang salah.

## Scope

Perbaiki adapter dan contract tests agar sesuai dokumentasi provider yang berlaku, pisahkan merchant order ID dari provider reference, fail-closed terhadap env/base URL yang tidak koheren, dan verifikasi acknowledgement callback. Validasi Xendit QR/payout pada contract yang sama; jangan mengubah provider pilihan produk.

## Langkah implementasi

1. Bekukan source of truth kontrak: URL production/sandbox, method, content type, field casing, status code, formula signature, callback response, timeout, dan idempotency. Simpan referensi URL/dokumen dan tanggal verifikasi di test/doc, bukan secret.
2. Ganti helper signature Duitku sesuai API aktif (HMAC-SHA256, lowercase hex) untuk inquiry, callback, dan transaction status. Tambahkan known-vector test dari fixture non-secret dan negative tests untuk MD5/field reorder/wrong amount/wrong merchant.
3. Pertahankan callback parser yang kompatibel hanya bila provider memang mengirim legacy format; jangan menerima signature legacy di live tanpa explicit mode/feature boundary. Uji body form-urlencoded dan JSON shape yang benar-benar didukung.
4. Ubah model/port atau lookup context sehingga `merchantOrderId` asli disimpan dan dipakai untuk `transactionStatus`; `reference` disimpan sebagai provider reference terpisah untuk audit. Migrasi data lama harus punya mapping/repair report dan tidak boleh menebak ID.
5. Jadikan `DUITKU_ENV`, `APP_ENV`, `DUITKU_BASE_URL`, callback URL, dan return URL koheren saat boot. Production harus menolak base URL sandbox, empty/default sandbox, non-HTTPS, atau host tak-allowlist. Staging/sandbox harus menolak passport URL.
6. Verifikasi response acknowledgement provider (`SUCCESS`/format yang didokumentasikan) dengan integration stub yang mencatat status dan body; jangan menyimpulkan dari komentar lama.
7. Audit Xendit QR code dan payout API version, endpoint, body shape, callback token, idempotency header, dan fallback behavior terhadap dokumentasi Xendit terbaru. Fallback v1 tidak boleh menyamarkan error v2 yang non-retryable.
8. Tambahkan contract tests melalui `httptest` yang assert URL path, method, headers, signature, order ID, amount, response mapping, timeout, 4xx/5xx classification, serta no-secret logging.

## Acceptance criteria

- Semua signature tests memakai HMAC-SHA256 vector yang cocok dengan dokumentasi aktif; MD5 vector lama tidak lagi dianggap valid di live path.
- Create → persist → status lookup membuktikan `merchantOrderId` tetap identik dengan ID awal dan `reference` hanya provider reference.
- Production config tanpa base URL eksplisit tidak pernah memilih sandbox; mismatch env/host gagal sebelum server listen.
- Callback provider dengan signature valid menghasilkan HTTP 200 dan acknowledgement yang didokumentasikan; invalid/replay tidak mengubah ledger/order.
- Disposable integration stub membuktikan PAID, PENDING, FAILED/EXPIRED, timeout, duplicate callback, dan unknown outcome.
- `go test ./internal/adapters/duitku/... ./internal/adapters/xendit/... ./internal/application/...` hijau dan evidence menyertakan command/output ringkas.

## Rollback dan observability

Deploy sebagai canary dengan payment create disabled atau allowlist order aman. Sediakan rollback image sebelumnya tanpa down-migration. Emit metric terpisah untuk provider auth/signature rejection, callback accepted/rejected, status lookup not-found, unknown outcome, dan environment mismatch; redaksi order/customer.

