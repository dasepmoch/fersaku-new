import Link from "next/link";
import { ArrowRight, Code2, Radio, ShieldCheck, Webhook } from "lucide-react";
import { MarketingHero, MarketingShell } from "@/components/marketing-shell";

const apiCode = `const response = await fetch(
  "https://api.fersaku.id/v1/qris/payments",
  {
    method: "POST",
    headers: { Authorization: "Bearer sk_test_..." },
    body: JSON.stringify({
      amount: 99000,
      description: "AI Prompt Pack",
      customer: { email: "budi@example.com" }
    })
  }
);

// 201 Created
{
  "id": "qris_2Yc91p",
  "status": "pending",
  "expires_in": 900
}`;

const benefits = [
  [Code2, "RESTful & typed", "Request sederhana, respons konsisten."],
  [Radio, "Status real-time", "Polling atau webhook, kamu yang pilih."],
  [Webhook, "Webhook terpercaya", "Signed payload dan delivery logs."],
  [ShieldCheck, "Test mode", "Bangun tanpa menyentuh uang nyata."],
];

export default function ApiPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Fersaku for developers"
        title={
          <>
            QRIS API untuk digital commerce{" "}
            <em className="text-[#315d47]">Indonesia.</em>
          </>
        }
        description="Buat QRIS checkout, pantau order, dan kirim produk digital secara otomatis dengan API yang terasa familiar."
      />
      <section className="px-5 pb-28 lg:px-8">
        <div className="mx-auto grid max-w-[1180px] gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <div className="grid content-start gap-3">
            {benefits.map(([Icon, title, description]) => (
              <div
                key={title as string}
                className="hairline shadow-card rounded-3xl border bg-white p-5"
              >
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d7ff64]">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold">
                      {title as string}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[#6f7c74]">
                      {description as string}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="shadow-float overflow-hidden rounded-[32px] bg-[#101b16] text-white">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex gap-2">
                <span className="size-2 rounded-full bg-[#ff794d]" />
                <span className="size-2 rounded-full bg-[#ffe69a]" />
                <span className="size-2 rounded-full bg-[#bdf8d0]" />
              </div>
              <span className="text-[10px] font-bold text-white/35">
                POST /v1/qris/payments
              </span>
            </div>
            <pre className="overflow-x-auto p-6 text-[11px] leading-6 text-white/70 sm:p-8 sm:text-xs">
              <code>{apiCode}</code>
            </pre>
          </div>
        </div>
        <div className="mx-auto mt-16 max-w-[1180px] rounded-[34px] bg-[#d7ff64] p-8 sm:flex sm:items-center sm:justify-between sm:p-12">
          <div>
            <h2 className="font-display text-4xl sm:text-5xl">
              Ship pembayaran pertamamu.
            </h2>
            <p className="mt-2 text-sm text-[#50613d]">
              Dokumentasi lengkap, contoh kode, dan test keys sudah menunggu.
            </p>
          </div>
          <Link
            href="/docs/api"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#173f2c] px-6 py-3 text-sm font-bold text-white sm:mt-0"
          >
            Buka dokumentasi <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
