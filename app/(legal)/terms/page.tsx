import { ContentPage, ProseSection } from "@/components/content-page";
export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Ketentuan Layanan"
      description="Terakhir diperbarui 12 Juli 2026. Placeholder ini bukan nasihat hukum dan harus direview sebelum produksi."
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
        <h2>Biaya dan settlement</h2>
        <p>
          Biaya platform dan pembayaran ditampilkan sebelum penggunaan. Dana
          dapat melalui masa settlement, review risiko, hold, atau penyesuaian
          yang dapat diaudit.
        </p>
        <h2>Penangguhan akun</h2>
        <p>
          Fersaku dapat membatasi layanan untuk keamanan, kepatuhan, dugaan
          fraud, risiko pembeli, atau pelanggaran ketentuan.
        </p>
      </ProseSection>
    </ContentPage>
  );
}
