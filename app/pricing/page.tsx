import { Check, Minus } from "lucide-react";
import { MarketingHero, MarketingShell } from "@/components/marketing-shell";
import { PrimaryButton } from "@/components/brand";

const pricing = {
  starter: { fee: "3%", payment: "+ biaya pembayaran" },
  pro: { monthly: "Rp99.000", fee: "1,5%" },
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Harga yang masuk akal"
        title={
          <>
            Mulai gratis. Bayar saat{" "}
            <em className="text-[#315d47]">berhasil.</em>
          </>
        }
        description="Tidak ada biaya setup, kontrak panjang, atau kejutan di akhir bulan. Harga final tetap dapat disesuaikan sebelum peluncuran."
      />
      <section className="px-5 pb-28 lg:px-8">
        <div className="mx-auto grid max-w-[900px] gap-5 md:grid-cols-2">
          <article className="hairline shadow-card rounded-[34px] border bg-white p-7 sm:p-9">
            <p className="text-xs font-extrabold tracking-[.15em] text-[#637169] uppercase">
              Starter
            </p>
            <div className="mt-7">
              <span className="font-display text-7xl tracking-[-.05em]">
                Gratis
              </span>
            </div>
            <p className="mt-3 text-sm text-[#6d7972]">
              Semua yang kamu butuhkan untuk mulai jualan.
            </p>
            <PrimaryButton href="/register" className="mt-8 w-full">
              Mulai gratis
            </PrimaryButton>
            <div className="hairline mt-8 grid gap-4 border-t pt-7">
              {[
                "Produk tanpa batas",
                "Hosted storefront",
                "Checkout QRIS",
                "Delivery otomatis",
                "Analitik penjualan",
                "Email support",
              ].map((x) => (
                <span
                  key={x}
                  className="flex items-center gap-3 text-sm font-semibold"
                >
                  <Check className="size-4 text-[#276b49]" />
                  {x}
                </span>
              ))}
            </div>
            <div className="mt-8 rounded-2xl bg-[#eff1eb] p-4 text-xs leading-5 text-[#5d6b63]">
              Biaya platform <b>{pricing.starter.fee}</b>{" "}
              {pricing.starter.payment}. Hanya dipotong saat terjadi penjualan.
            </div>
          </article>
          <article className="shadow-float relative overflow-hidden rounded-[34px] bg-[#173f2c] p-7 text-white sm:p-9">
            <div className="absolute top-0 right-0 rounded-bl-2xl bg-[#d7ff64] px-4 py-2 text-[10px] font-extrabold tracking-wider text-[#173f2c] uppercase">
              Untuk yang bertumbuh
            </div>
            <p className="text-xs font-extrabold tracking-[.15em] text-[#d7ff64] uppercase">
              Pro
            </p>
            <div className="mt-7">
              <span className="font-display text-7xl tracking-[-.05em]">
                {pricing.pro.monthly}
              </span>
              <span className="ml-2 text-xs text-white/50">/bulan</span>
            </div>
            <p className="mt-3 text-sm text-white/55">
              Biaya lebih rendah dan fitur untuk skala lebih besar.
            </p>
            <PrimaryButton
              href="/register"
              className="mt-8 w-full !bg-[#d7ff64] !text-[#173f2c]"
            >
              Coba Pro
            </PrimaryButton>
            <div className="mt-8 grid gap-4 border-t border-white/10 pt-7">
              {[
                "Semua fitur Starter",
                `Biaya platform ${pricing.pro.fee}`,
                "Custom domain",
                "Advanced analytics",
                "Webhook & API penuh",
                "Prioritas support",
              ].map((x) => (
                <span
                  key={x}
                  className="flex items-center gap-3 text-sm font-semibold"
                >
                  <Check className="size-4 text-[#d7ff64]" />
                  {x}
                </span>
              ))}
            </div>
            <div className="mt-8 rounded-2xl bg-white/[.06] p-4 text-xs leading-5 text-white/55">
              Cocok untuk toko dengan omzet di atas Rp7 juta per bulan.
            </div>
          </article>
        </div>
        <div className="mx-auto mt-16 max-w-[900px]">
          <h2 className="font-display text-center text-4xl">
            Bandingkan fitur
          </h2>
          <div className="hairline mt-8 overflow-hidden rounded-3xl border bg-white">
            {[
              ["Jumlah produk", "Tanpa batas", "Tanpa batas"],
              ["Delivery otomatis", "Ya", "Ya"],
              ["Kupon", "Ya", "Ya"],
              ["Custom domain", "—", "Ya"],
              ["API & webhook", "Dasar", "Penuh"],
              ["Support", "Email", "Prioritas"],
            ].map((row, i) => (
              <div
                key={row[0]}
                className={`grid grid-cols-[1.5fr_1fr_1fr] px-5 py-4 text-xs sm:text-sm ${i ? "hairline border-t" : "bg-[#eff1eb] font-bold"}`}
              >
                {row.map((x, j) => (
                  <span
                    key={x + j}
                    className={j ? "text-center" : "font-semibold"}
                  >
                    {x === "—" ? (
                      <Minus className="mx-auto size-4 text-[#9aa39e]" />
                    ) : (
                      x
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
