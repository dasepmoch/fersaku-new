import { ContentPage, ProseSection } from "@/components/content-page";
export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Kebijakan Privasi"
      description="Terakhir diperbarui 12 Juli 2026. Dokumen frontend ini merupakan placeholder yang harus ditinjau penasihat hukum sebelum peluncuran."
    >
      <ProseSection>
        <h2>Informasi yang kami kumpulkan</h2>
        <p>
          Kami mengumpulkan informasi akun, toko, produk, pelanggan, transaksi,
          perangkat, dan aktivitas yang diperlukan untuk menyediakan layanan
          Fersaku.
        </p>
        <h2>Bagaimana informasi digunakan</h2>
        <p>
          Data digunakan untuk menjalankan checkout, mengirim produk, memproses
          penarikan, mencegah fraud, menyediakan support, dan meningkatkan
          produk.
        </p>
        <h2>Penyedia layanan</h2>
        <p>
          Informasi tertentu dapat diproses oleh penyedia pembayaran,
          disbursement, storage, email, analytics, dan infrastruktur sesuai
          kebutuhan layanan.
        </p>
        <h2>Retensi dan keamanan</h2>
        <p>
          Kami menyimpan data selama dibutuhkan untuk layanan, kepatuhan,
          penyelesaian sengketa, dan audit. Kontrol akses serta logging
          diterapkan untuk mengurangi risiko akses tidak sah.
        </p>
        <h2>Hak pengguna</h2>
        <p>
          Pengguna dapat meminta akses, koreksi, atau penghapusan data sesuai
          hukum yang berlaku dengan menghubungi privacy@fersaku.id.
        </p>
      </ProseSection>
    </ContentPage>
  );
}
