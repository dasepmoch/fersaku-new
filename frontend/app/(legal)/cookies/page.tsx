import { ContentPage, ProseSection } from "@/components/content-page";
export default function CookiesPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Kebijakan Cookie"
      description="Penjelasan mengenai penyimpanan browser yang digunakan Fersaku."
    >
      <ProseSection>
        <h2>Cookie esensial</h2>
        <p>
          Digunakan untuk sesi, keamanan, preferensi tampilan terang atau gelap,
          dan fungsi dasar aplikasi.
        </p>
        <h2>Analytics</h2>
        <p>
          Analytics membantu memahami performa halaman dan penggunaan fitur.
          Implementasi production harus menyediakan consent yang sesuai.
        </p>
        <h2>Mengelola cookie</h2>
        <p>
          Kamu dapat menghapus atau memblokir cookie melalui browser. Beberapa
          fitur akun mungkin tidak berfungsi tanpa cookie esensial.
        </p>
      </ProseSection>
    </ContentPage>
  );
}
