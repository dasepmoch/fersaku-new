"use client";
import { Check, Mail, MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { ContentPage } from "@/components/content-page";
import { LEGAL_CONTACTS } from "@/lib/legal-public-surface";
import { getDomainSource } from "@/shared/data/domain-source";

/** PUB-200: contact command OUT-OF-SCOPE for launch; API/live must not fake-success. */
const CONTACT_SUBMIT_DISABLED_TITLE =
  "Contact submit is out of scope for launch (PUB-200 deferred)";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const publicSource = (() => {
    try {
      return getDomainSource("publicCatalog");
    } catch {
      return "api";
    }
  })();
  // Mock may keep prototype setSent; API/disabled must be authoritatively disabled.
  const contactSubmitEnabled = publicSource === "mock";
  return (
    <ContentPage
      eyebrow="Hubungi kami"
      title={
        <>
          Mari ngobrol tentang <em className="text-[#315d47]">karyamu.</em>
        </>
      }
      description={
        contactSubmitEnabled
          ? "Pertanyaan produk, partnership, media, atau sekadar ingin menyapa—kami siap mendengar."
          : "Pengiriman formulir belum tersedia. Gunakan email support di bawah—kami tidak menampilkan sukses palsu."
      }
    >
      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="mx-auto grid max-w-[1000px] gap-5 lg:grid-cols-[.7fr_1.3fr]">
          <div className="grid content-start gap-4">
            {[
              [Mail, "General", LEGAL_CONTACTS.general],
              [MessageSquare, "Support", LEGAL_CONTACTS.support],
              [Send, "Partnership", LEGAL_CONTACTS.partners],
            ].map(([Icon, t, d]) => (
              <div
                key={t as string}
                className="hairline shadow-card rounded-[24px] border bg-white p-5"
              >
                <Icon className="size-4 text-[#315d47]" />
                <b className="mt-8 block text-sm">{t as string}</b>
                <p className="mt-1 text-xs text-[#718078]">
                  <a
                    href={`mailto:${d as string}`}
                    className="text-[#315d47] underline-offset-2 hover:underline"
                  >
                    {d as string}
                  </a>
                </p>
              </div>
            ))}
          </div>
          <div className="hairline shadow-card rounded-[30px] border bg-white p-6 sm:p-8">
            {sent && contactSubmitEnabled ? (
              <div className="py-16 text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#d7ff64]">
                  <Check className="size-7" />
                </span>
                <h2 className="font-display mt-5 text-5xl">Pesan terkirim.</h2>
                <p className="mt-3 text-xs text-[#718078]">
                  Tim kami akan membalas maksimal 2 hari kerja.
                </p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-6 text-xs font-extrabold text-[#315d47]"
                >
                  Kirim pesan lain
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {!contactSubmitEnabled ? (
                  <p className="rounded-xl border border-[#17231d]/12 bg-[#f8f7f2] p-3 text-xs leading-5 text-[#647169]">
                    Formulir kirim pesan dinonaktifkan untuk peluncuran
                    (PUB-200). Tidak ada backend kontak publik. Hubungi{" "}
                    <a
                      href={`mailto:${LEGAL_CONTACTS.support}`}
                      className="font-bold text-[#315d47] underline-offset-2 hover:underline"
                    >
                      {LEGAL_CONTACTS.support}
                    </a>
                    .
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nama">
                    <input
                      placeholder="Nama kamu"
                      disabled={!contactSubmitEnabled}
                      readOnly={!contactSubmitEnabled}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      placeholder="email@kamu.com"
                      disabled={!contactSubmitEnabled}
                      readOnly={!contactSubmitEnabled}
                    />
                  </Field>
                </div>
                <Field label="Topik">
                  <select disabled={!contactSubmitEnabled}>
                    <option>Product support</option>
                    <option>Partnership</option>
                    <option>Media & press</option>
                    <option>Security report</option>
                  </select>
                </Field>
                <Field label="Pesan">
                  <textarea
                    rows={7}
                    placeholder="Ceritakan apa yang bisa kami bantu..."
                    disabled={!contactSubmitEnabled}
                    readOnly={!contactSubmitEnabled}
                  />
                </Field>
                <button
                  type="button"
                  disabled={!contactSubmitEnabled}
                  title={
                    contactSubmitEnabled
                      ? undefined
                      : CONTACT_SUBMIT_DISABLED_TITLE
                  }
                  onClick={() => {
                    if (!contactSubmitEnabled) return;
                    setSent(true);
                  }}
                  className="h-12 rounded-xl bg-[#173f2c] text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {contactSubmitEnabled
                    ? "Kirim pesan"
                    : "Kirim pesan (tidak tersedia)"}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </ContentPage>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <div className="[&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:border-[#17231d]/12 [&>*]:bg-transparent [&>*]:p-3 [&>*]:text-sm [&>*]:font-normal [&>*]:outline-none [&>*:disabled]:cursor-not-allowed [&>*:disabled]:opacity-60">
        {children}
      </div>
    </label>
  );
}
