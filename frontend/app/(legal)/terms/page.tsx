import { ContentPage, ProseSection } from "@/components/content-page";
import {
  LEGAL_CONTACTS,
  LEGAL_DOC_VERSION,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/legal-public-surface";

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Ketentuan Layanan"
      description={`Berlaku ${LEGAL_EFFECTIVE_DATE} · Versi ${LEGAL_DOC_VERSION}. Layanan dioperasikan di Republik Indonesia. Dukungan: ${LEGAL_CONTACTS.support}.`}
    >
      <ProseSection>
        <h2>Penggunaan layanan</h2>
        <p>
          Fersaku menyediakan perangkat untuk membuat toko, menjual produk
          digital, menerima pembayaran QRIS, mengirim produk, dan mengelola
          saldo seller.
        </p>
        <h2>Tanggung jawab seller</h2>
        <p>
          Seller bertanggung jawab atas legalitas, kualitas, deskripsi, hak
          kekayaan intelektual, support, dan pemenuhan produk yang dijual.
        </p>
        <h2>Produk yang dilarang</h2>
        <p>
          Produk ilegal, menipu, melanggar hak pihak lain, mengandung malware,
          atau melanggar kebijakan penyedia pembayaran tidak diperbolehkan.
        </p>
        <h2>Biaya, settlement, dan penarikan</h2>
        <p>
          Biaya platform dan pembayaran ditampilkan sebelum penggunaan. Dana
          dapat melalui masa settlement, review risiko, hold, atau penyesuaian
          yang dapat diaudit sebelum penarikan tersedia.
        </p>
        <h2>KYC dan retensi akun</h2>
        <p>
          Verifikasi identitas (KYC) dapat diminta untuk mengaktifkan fitur
          pembayaran atau penarikan. Data KYC disimpan seperlunya untuk
          kepatuhan dan pencegahan penyalahgunaan.
        </p>
        <h2>Refund</h2>
        <p>
          Kebijakan refund mengikuti aturan produk seller dan ketentuan
          pembayaran yang berlaku; platform dapat menahan atau menyesuaikan dana
          bila ada sengketa, fraud, atau kewajiban hukum.
        </p>
        <h2>Penangguhan akun</h2>
        <p>
          Fersaku dapat membatasi layanan untuk keamanan, kepatuhan, dugaan
          fraud, risiko pembeli, atau pelanggaran ketentuan.
        </p>
        <h2>Perubahan ketentuan</h2>
        <p>
          Perubahan material akan ditandai dengan pembaruan tanggal berlaku dan
          nomor versi di halaman ini. Kontak: {LEGAL_CONTACTS.support}.
        </p>
      </ProseSection>
    </ContentPage>
  );
}
