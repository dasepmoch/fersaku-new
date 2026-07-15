"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Gift,
  LoaderCircle,
  LockKeyhole,
  Minus,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductArt } from "@/components/product-art";
import type { Product } from "@/lib/mock-data";
import type { StorefrontConfig } from "@/lib/storefront-mock-data";
import { rupiah } from "@/lib/utils";

type Step = "details" | "qris" | "paid";
const wallets = [
  { name: "GoPay", color: "#00aed6" },
  { name: "OVO", color: "#6c2dbd" },
  { name: "DANA", color: "#1688f8" },
  { name: "ShopeePay", color: "#ee4d2d" },
];

export function CheckoutExperience({
  product,
  store,
}: {
  product: Product;
  store: StorefrontConfig;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [customPrice, setCustomPrice] = useState(product.price);
  const [tip, setTip] = useState(0);
  const [upsell, setUpsell] = useState(false);
  const [wallet, setWallet] = useState("OVO");
  const [seconds, setSeconds] = useState(895);
  const [paying, setPaying] = useState(false);
  const [notification, setNotification] = useState(false);
  const upsellProduct = store.products.find(
    (p) => p.slug === "cursor-rules-kit",
  );
  const upsellPrice = 39000;
  const base = product.allowPayWhatYouWant
    ? Math.max(product.minimumPrice || product.price, customPrice)
    : product.price;
  const total = base + tip + (upsell ? upsellPrice : 0);
  const valid =
    name.trim().length > 2 &&
    /.+@.+\..+/.test(email);
  useEffect(() => {
    if (step !== "qris") return;
    const interval = setInterval(
      () => setSeconds((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [step]);
  const time = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const simulate = () => {
    setPaying(true);
    setNotification(false);
    setTimeout(() => setNotification(true), 650);
    setTimeout(() => {
      setStep("paid");
      setPaying(false);
    }, 1850);
    setTimeout(
      () =>
        router.push(
          `/orders/FRS-240712-1848/success?total=${total}&tip=${tip}&upsell=${upsell ? 1 : 0}`,
        ),
      3000,
    );
  };
  return (
    <main className="min-h-screen bg-[#f3f2ec]">
      <header className="mx-auto flex h-20 max-w-[1160px] items-center justify-between px-5">
        <Link
          href={`/@${store.slug}/${product.slug}`}
          className="flex items-center gap-2 text-[10px] font-bold text-[#718078]"
        >
          <ChevronLeft className="size-4" /> Kembali ke produk
        </Link>
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[#748078] uppercase">
          <LockKeyhole className="size-3.5" /> Secure checkout
        </span>
      </header>
      <div className="mx-auto grid max-w-[1080px] gap-8 px-5 pt-5 pb-16 lg:grid-cols-[1fr_470px] lg:items-start lg:pt-10">
        <section className="lg:sticky lg:top-8">
          <div className="flex gap-5">
            <ProductArt
              palette={product.palette}
              glyph={product.glyph}
              className="size-24 shrink-0 sm:size-32"
            />
            <div>
              <p className="text-xs font-bold text-[#708078]">{store.name}</p>
              <h1 className="font-display mt-2 text-3xl leading-none sm:text-4xl">
                {product.title}
              </h1>
              <div className="mt-3 flex items-center gap-2">
                <b className="text-xl">{rupiah(base)}</b>
                {product.allowPayWhatYouWant && (
                  <span className="rounded-full bg-[#e9ff9b] px-2 py-1 text-[8px] font-extrabold text-[#173f2c]">
                    PAY WHAT YOU WANT
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="hairline shadow-card mt-8 rounded-[24px] border bg-[#fbfaf7] p-5">
            <h2 className="text-[10px] font-extrabold tracking-[.15em] text-[#718078] uppercase">
              Order summary
            </h2>
            <div className="mt-5 grid gap-3 text-xs">
              <div className="flex justify-between">
                <span>{product.title}</span>
                <b>{rupiah(base)}</b>
              </div>
              {tip > 0 && (
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <Gift className="size-3.5" /> Dukungan kreator
                  </span>
                  <b>{rupiah(tip)}</b>
                </div>
              )}
              {upsell && (
                <div className="flex justify-between">
                  <span>{upsellProduct?.title || "Cursor Rules Kit"}</span>
                  <b>{rupiah(upsellPrice)}</b>
                </div>
              )}
              <div className="flex justify-between">
                <span>Biaya layanan</span>
                <b>Rp0</b>
              </div>
              <div className="hairline mt-2 flex justify-between border-t pt-4 text-lg font-extrabold">
                <span>Total</span>
                <span>{rupiah(total)}</span>
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-[#e6e9e2] p-4 text-xs leading-5 text-[#6b786f]">
            Akses digital dikirim otomatis ke email setelah pembayaran
            terverifikasi.
          </div>
        </section>
        <section className="hairline shadow-float rounded-[32px] border bg-[#fbfaf7] p-5 sm:p-8">
          {step === "details" && (
            <div>
              <p className="text-[10px] font-extrabold tracking-[.15em] text-[#718078] uppercase">
                Checkout details
              </p>
              <h2 className="font-display mt-2 text-4xl tracking-[-.03em]">
                Hampir jadi milikmu.
              </h2>
              {product.allowPayWhatYouWant && (
                <div className="checkout-pwyw mt-6 rounded-2xl border border-[#c9dba9] bg-[#f1f8e5] p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-[#315d47]" />
                    <b className="text-[10px]">
                      Tentukan harga yang terasa tepat
                    </b>
                  </div>
                  <p className="mt-1 text-[9px] text-[#65736b]">
                    Minimum {rupiah(product.minimumPrice || product.price)}.
                    Selisihnya langsung mendukung kreator.
                  </p>
                  <div className="hairline mt-3 flex h-12 overflow-hidden rounded-xl border bg-white">
                    <span className="checkout-price-prefix flex items-center bg-[#eef0eb] px-3 text-xs font-bold">
                      Rp
                    </span>
                    <input
                      type="number"
                      min={product.minimumPrice || product.price}
                      value={customPrice}
                      onChange={(e) => setCustomPrice(Number(e.target.value))}
                      className="min-w-0 flex-1 px-3 font-extrabold outline-none"
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    {[10000, 25000, 50000].map((x) => (
                      <button
                        key={x}
                        onClick={() => setCustomPrice((value) => value + x)}
                        className="checkout-price-button hairline rounded-lg border bg-white px-2.5 py-2 text-[8px] font-bold"
                      >
                        +{rupiah(x)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-5 grid gap-4">
                <Field label="Nama lengkap">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama kamu"
                    className="hairline h-12 rounded-xl border bg-white px-4 text-sm outline-none"
                  />
                </Field>
                <Field label="Email">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="email@kamu.com"
                    className="hairline h-12 rounded-xl border bg-white px-4 text-sm outline-none"
                  />
                </Field>
              </div>
              <div className="mt-5 rounded-[22px] border-2 border-[#173f2c] bg-[#eff3e9] p-4">
                <div className="flex items-center">
                  <span className="grid size-10 place-items-center rounded-xl bg-white">
                    <QrCode className="size-5" />
                  </span>
                  <div className="ml-3">
                    <b className="block text-sm">QRIS</b>
                    <span className="text-[10px] text-[#6f7b74]">
                      Semua e-wallet & mobile banking
                    </span>
                  </div>
                  <span className="ml-auto grid size-5 place-items-center rounded-full border-[5px] border-[#173f2c] bg-white" />
                </div>
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <b className="text-[10px]">
                    Tambahkan dukungan untuk kreator
                  </b>
                  <Gift className="size-4 text-[#315d47]" />
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[0, 10000, 25000, 50000].map((x) => (
                    <button
                      key={x}
                      onClick={() => setTip(x)}
                      className={`rounded-xl border px-2 py-2.5 text-[8px] font-extrabold ${tip === x ? "border-[#173f2c] bg-[#e9ff9b] text-[#173f2c]" : "hairline bg-white"}`}
                    >
                      {x === 0 ? "Tanpa tip" : `+${rupiah(x)}`}
                    </button>
                  ))}
                </div>
              </div>
              {upsellProduct && (
                <div className="mt-5 overflow-hidden rounded-[22px] border border-[#efc878] bg-[#fff8e7]">
                  <div className="bg-[#173f2c] px-4 py-2 text-center text-[8px] font-extrabold tracking-[.14em] text-[#d7ff64] uppercase">
                    One-time checkout offer • Hemat 34%
                  </div>
                  <div className="checkout-upsell-body flex gap-3 p-4">
                    <span
                      className="grid size-12 shrink-0 place-items-center rounded-xl text-[10px] font-black"
                      style={{ backgroundColor: upsellProduct.palette }}
                    >
                      {upsellProduct.glyph}
                    </span>
                    <div className="min-w-0">
                      <b className="text-[10px]">
                        Tambah {upsellProduct.title}
                      </b>
                      <p className="mt-1 text-[8px] leading-4 text-[#718078]">
                        Rules siap tempel untuk coding dengan AI.
                      </p>
                      <button
                        onClick={() => setUpsell(!upsell)}
                        className="mt-2 flex items-center gap-1 text-[9px] font-extrabold text-[#315d47]"
                      >
                        {upsell ? (
                          <Minus className="size-3" />
                        ) : (
                          <Plus className="size-3" />
                        )}
                        {upsell
                          ? "Hapus dari pesanan"
                          : `Tambahkan +${rupiah(upsellPrice)}`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <button
                disabled={!valid}
                onClick={() => setStep("qris")}
                className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f2c] text-sm font-extrabold text-white disabled:opacity-35"
              >
                Bayar {rupiah(total)} <ArrowRight className="size-4" />
              </button>
              <p className="mt-4 flex items-center justify-center gap-1 text-[10px] font-bold text-[#7e8983]">
                <ShieldCheck className="size-3.5" /> Pembayaran terenkripsi dan
                aman
              </p>
            </div>
          )}
          {step === "qris" && (
            <div className="text-center">
              <p className="text-[10px] font-extrabold tracking-[.15em] text-[#718078] uppercase">
                QRIS payment simulator
              </p>
              <h2 className="font-display mt-2 text-4xl">
                Pilih e-wallet, lalu scan.
              </h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-[1fr_170px] sm:items-center">
                <div>
                  <div className="hairline shadow-card mx-auto grid aspect-square max-w-56 place-items-center rounded-[28px] border bg-white">
                    <div className="relative">
                      <QrCode
                        className="size-40 text-[#17231d]"
                        strokeWidth={1.2}
                      />
                      <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-[#173f2c] text-xs font-black text-[#d7ff64]">
                        F
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-2xl font-extrabold">
                    {rupiah(total)}
                  </p>
                  <p className="mt-1 text-[10px] text-[#718078]">
                    QR berlaku <b className="text-[#b2573c]">{time}</b>
                  </p>
                </div>
                <div className="relative mx-auto h-[310px] w-[158px] overflow-hidden rounded-[28px] border-[6px] border-[#17231d] bg-[#edf0e9] shadow-2xl">
                  <div className="mx-auto h-4 w-16 rounded-b-xl bg-[#17231d]" />
                  <div className="p-3 text-left">
                    <p className="text-[6px] font-bold text-[#718078]">
                      12:42 • Simulator
                    </p>
                    <div className="mt-5 rounded-2xl bg-white p-3">
                      <span
                        className="grid size-8 place-items-center rounded-xl text-[7px] font-black text-white"
                        style={{
                          backgroundColor: wallets.find(
                            (x) => x.name === wallet,
                          )?.color,
                        }}
                      >
                        {wallet}
                      </span>
                      <p className="mt-3 text-[7px] font-black">
                        Bayar Fersaku
                      </p>
                      <p className="mt-1 text-[11px] font-black">
                        {rupiah(total)}
                      </p>
                    </div>
                    {notification && (
                      <div className="ewallet-notification absolute top-7 right-2 left-2 rounded-xl bg-[#17231d] p-3 text-white shadow-xl">
                        <p className="text-[6px] font-black">
                          {wallet} • sekarang
                        </p>
                        <p className="mt-1 text-[7px] leading-3">
                          Pembayaran {rupiah(total)} ke Fersaku berhasil!
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-3 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-[#17231d]" />
                </div>
              </div>
              <div className="mt-6 grid grid-cols-4 gap-2">
                {wallets.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      setWallet(item.name);
                      setNotification(false);
                    }}
                    className={`rounded-xl border py-2.5 text-[8px] font-extrabold ${wallet === item.name ? "border-[#173f2c] bg-[#eff3e9]" : "hairline bg-white"}`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <button
                onClick={simulate}
                disabled={paying}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white"
              >
                {paying ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Smartphone className="size-4" />
                )}
                {paying
                  ? `Membuka ${wallet} simulator...`
                  : `Bayar dengan ${wallet}`}
              </button>
              <button
                onClick={() => setStep("details")}
                className="mt-4 text-[10px] font-bold text-[#718078]"
              >
                Ubah detail pesanan
              </button>
            </div>
          )}
          {step === "paid" && (
            <div className="py-10 text-center">
              <span className="mx-auto grid size-20 place-items-center rounded-full bg-[#d7ff64]">
                <Check className="size-9 text-[#173f2c]" />
              </span>
              <h2 className="font-display mt-6 text-5xl">
                Pembayaran berhasil!
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#718078]">
                Receipt dikirim ke email. Menyiapkan akses produk dan invoice...
              </p>
              <LoaderCircle className="mx-auto mt-6 size-5 animate-spin" />
            </div>
          )}
        </section>
      </div>
    </main>
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
      {children}
    </label>
  );
}
