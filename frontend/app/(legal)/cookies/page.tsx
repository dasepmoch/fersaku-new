import { ContentPage, ProseSection } from "@/components/content-page";
import {
  COOKIE_STORAGE_INVENTORY,
  HAS_THIRD_PARTY_MARKETING_COOKIES,
  LEGAL_DOC_VERSION,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/legal-public-surface";

export default function CookiesPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Kebijakan Cookie"
      description={`Berlaku ${LEGAL_EFFECTIVE_DATE} · Versi ${LEGAL_DOC_VERSION}. Inventaris penyimpanan browser first-party yang dipakai Fersaku.`}
    >
      <ProseSection>
        <h2>Ringkasan</h2>
        <p>
          Fersaku memakai cookie dan penyimpanan browser sebatas yang diperlukan
          agar sesi, keamanan, dan preferensi tampilan berfungsi.
          {HAS_THIRD_PARTY_MARKETING_COOKIES
            ? " Cookie marketing pihak ketiga diaktifkan hanya setelah consent."
            : " Saat ini tidak ada cookie analytics/marketing pihak ketiga."}
        </p>
        <h2>Inventaris</h2>
        {COOKIE_STORAGE_INVENTORY.map((item) => (
          <p key={item.id}>
            <strong>
              {item.id} ({item.kind}, {item.category})
            </strong>
            {" — "}
            {item.purpose}
          </p>
        ))}
        <h2>Consent dan penarikan</h2>
        <p>
          Cookie esensial dan preferensi tampilan diaktifkan secara default agar
          layanan berfungsi. Observability first-party (bila mode sink aktif)
          mengirim event error/metrik yang sudah di-redact ke endpoint
          same-origin, tanpa cookie marketing. Untuk menarik preferensi lokal,
          hapus data situs di browser atau gunakan logout untuk mengakhiri sesi.
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
