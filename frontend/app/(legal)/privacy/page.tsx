import { ContentPage, ProseSection } from "@/components/content-page";
import {
  LEGAL_CONTACTS,
  LEGAL_DOC_VERSION,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/legal-public-surface";

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Kebijakan Privasi"
      description={`Berlaku ${LEGAL_EFFECTIVE_DATE} · Versi ${LEGAL_DOC_VERSION}. Pengendali data: operator layanan Fersaku. Yurisdiksi: Republik Indonesia.`}
    >
      <ProseSection>
        <h2>Siapa yang mengendalikan data</h2>
        <p>
          Operator layanan Fersaku mengendalikan data pribadi yang diproses
          untuk menyediakan platform toko digital, checkout, pembayaran,
          pengiriman produk, dan dukungan. Permintaan terkait privasi:
          {` ${LEGAL_CONTACTS.privacy}`}.
        </p>
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
        <h2>Kategori prosesor / penyedia layanan</h2>
        <p>
          Informasi tertentu dapat diproses oleh penyedia pembayaran,
          disbursement, object storage, email/notifikasi, observability
          first-party, dan infrastruktur cloud sesuai kebutuhan layanan.
        </p>
        <h2>Transfer internasional</h2>
        <p>
          Sebagian infrastruktur atau prosesor dapat berada di luar Indonesia.
          Jika terjadi, kami menerapkan kontrol kontrak dan keamanan yang wajar
          sesuai praktik layanan.
        </p>
        <h2>Retensi dan keamanan</h2>
        <p>
          Kami menyimpan data selama dibutuhkan untuk layanan, kepatuhan,
          penyelesaian sengketa, dan audit. Kontrol akses serta logging
          diterapkan untuk mengurangi risiko akses tidak sah. Tidak ada sistem
          yang sepenuhnya bebas risiko.
        </p>
        <h2>Hak dan cara mengajukan permintaan</h2>
        <p>
          Pengguna dapat meminta akses, koreksi, atau penghapusan data sesuai
          hukum yang berlaku dengan menghubungi {LEGAL_CONTACTS.privacy}. Kami
          dapat meminta verifikasi identitas yang wajar sebelum memproses
          permintaan.
        </p>
        <h2>Perubahan kebijakan</h2>
        <p>
          Perubahan material akan ditandai dengan pembaruan tanggal berlaku dan
          nomor versi di halaman ini.
        </p>
      </ProseSection>
    </ContentPage>
  );
}
