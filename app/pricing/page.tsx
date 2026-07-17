import { Check, Minus } from "lucide-react";
import { MarketingHero, MarketingShell } from "@/components/marketing-shell";
import { PrimaryButton } from "@/components/brand";
import { getPublicFeeMarketingCopy } from "@/features/platform-fees";

// Next segment config requires a numeric literal (not imported const).
// Keep in sync with PUBLIC_FEE_REVALIDATE_SECONDS in features/platform-fees.
export const revalidate = 300;

export default async function PricingPage() {
  const pricing = await getPublicFeeMarketingCopy();

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
        description="Semua fitur gratis tanpa biaya setup atau bulanan. Biaya hanya dipotong saat transaksi berhasil atau saat kamu menarik saldo."
      />
      <section className="px-5 pb-28 lg:px-8">
        <div className="mx-auto grid max-w-[900px] gap-5 md:grid-cols-2">
          <article className="hairline shadow-card rounded-[34px] border bg-white p-7 sm:p-9">
            <p className="text-xs font-extrabold tracking-[.15em] text-[#637169] uppercase">
              Storefront
            </p>
            <div className="mt-7">
              <span className="font-display text-7xl tracking-[-.05em]">
                Gratis
              </span>
            </div>
            <p className="mt-3 text-sm text-[#6d7972]">
              Toko digital lengkap tanpa paket berlangganan.
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
              Biaya transaksi berhasil <b>{pricing.transaction}</b>. Semua fitur
              storefront tetap gratis digunakan.
            </div>
          </article>
          <article className="shadow-float relative overflow-hidden rounded-[34px] bg-[#173f2c] p-7 text-white sm:p-9">
            <div className="absolute top-0 right-0 rounded-bl-2xl bg-[#d7ff64] px-4 py-2 text-[10px] font-extrabold tracking-wider text-[#173f2c] uppercase">
              Untuk integrasi
            </div>
            <p className="text-xs font-extrabold tracking-[.15em] text-[#d7ff64] uppercase">
              QRIS API
            </p>
            <div className="mt-7">
              <span className="font-display text-7xl tracking-[-.05em]">
                Gratis
              </span>
            </div>
            <p className="mt-3 text-sm text-white/55">
              Payment gateway QRIS independen untuk website atau aplikasi kamu.
            </p>
            <PrimaryButton
              href="/register"
              className="mt-8 w-full !bg-[#d7ff64] !text-[#173f2c]"
            >
              Gunakan QRIS API
            </PrimaryButton>
            <div className="mt-8 grid gap-4 border-t border-white/10 pt-7">
              {[
                "Create & cek payment QRIS",
                "QRIS independen tanpa produk Fersaku",
                "Webhook pembayaran",
                "Sandbox untuk testing",
                "Live API setelah KYC",
                "Satu saldo dengan transaksi toko",
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
              Biaya transaksi tetap {pricing.transaction}, sama seperti checkout
              storefront. API ini bukan API katalog atau upload produk.
            </div>
          </article>
        </div>
        <div className="mx-auto mt-16 max-w-[900px]">
          <h2 className="font-display text-center text-4xl">
            Bandingkan fitur
          </h2>
          <div className="hairline mt-8 overflow-hidden rounded-3xl border bg-white">
            {[
              ["Fitur", "Storefront", "QRIS API"],
              ["Biaya bulanan", "Gratis", "Gratis"],
              [
                "Biaya transaksi berhasil",
                pricing.transaction,
                pricing.transaction,
              ],
              ["Produk & delivery", "Lengkap", "—"],
              ["QRIS checkout", "Hosted", "Independen"],
              ["Webhook pembayaran", "Ya", "Ya"],
              ["Saldo & penarikan", "Satu saldo", "Satu saldo"],
              ["Syarat live", "Buat toko", "Buat toko + KYC"],
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
        <div className="mx-auto mt-5 max-w-[900px] rounded-2xl bg-[#eff1eb] p-5 text-xs leading-5 text-[#5d6b63]">
          Penarikan saldo dikenakan <b>{pricing.withdrawal}</b> dengan minimum{" "}
          <b>{pricing.minimumWithdrawal}</b>. Biaya proses dikonfirmasi sebelum
          penarikan dijalankan.
        </div>
      </section>
    </MarketingShell>
  );
}
