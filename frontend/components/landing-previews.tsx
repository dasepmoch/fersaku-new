import {
  ArrowUpRight,
  Check,
  MoreHorizontal,
  QrCode,
  TrendingUp,
} from "lucide-react";
import { ProductArt } from "./product-art";

export function DashboardPreview() {
  const bars = [34, 48, 40, 64, 55, 76, 68, 88, 72, 94, 82, 100];
  return (
    <div className="animate-rise-3 relative mx-auto max-w-[1020px] px-3 sm:px-8">
      <div className="shadow-float animate-float absolute top-16 -left-8 hidden rounded-2xl border border-white/70 bg-white/85 p-4 backdrop-blur-xl lg:block">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[#d7ff64] text-[#173f2c]">
            <TrendingUp className="size-4" />
          </span>
          <div>
            <p className="text-[10px] font-bold tracking-wider text-[#7a877f] uppercase">
              Minggu ini
            </p>
            <p className="text-sm font-extrabold">+24,8%</p>
          </div>
        </div>
      </div>
      <div className="landing-demo-light shadow-float overflow-hidden rounded-[24px] border border-[#173f2c]/10 bg-[#fdfdfa] p-2 sm:rounded-[34px] sm:p-3">
        <div className="flex min-h-[440px] overflow-hidden rounded-[18px] border border-[#173f2c]/8 bg-[#f4f4ee] sm:rounded-[26px]">
          <aside className="hidden w-48 shrink-0 border-r border-[#173f2c]/8 bg-[#173f2c] p-5 text-white md:block">
            <div className="flex items-center gap-2 font-extrabold">
              <span className="grid size-7 rotate-[-6deg] place-items-center rounded-lg bg-[#d7ff64] text-xs text-[#173f2c]">
                F
              </span>{" "}
              fersaku
            </div>
            <div className="mt-8 rounded-xl bg-white/10 p-3">
              <p className="text-[9px] tracking-wider text-white/40 uppercase">
                Toko aktif
              </p>
              <p className="mt-1 text-xs font-bold">Asep AI Tools</p>
            </div>
            <div className="mt-7 grid gap-1 text-[11px] text-white/50">
              {[
                "Overview",
                "Produk",
                "Pesanan",
                "Pelanggan",
                "Kupon",
                "Saldo",
                "Storefront",
              ].map((x, i) => (
                <span
                  key={x}
                  className={
                    i === 0
                      ? "rounded-lg bg-[#d7ff64] px-3 py-2.5 font-bold text-[#173f2c]"
                      : "px-3 py-2.5"
                  }
                >
                  {x}
                </span>
              ))}
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-wider text-[#7d8982] uppercase">
                  Sabtu, 12 Juli
                </p>
                <h3 className="mt-1 text-lg font-extrabold tracking-tight">
                  Selamat siang, Asep
                </h3>
              </div>
              <div className="size-8 rounded-full bg-[#ffb69d]" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                ["Pendapatan", "Rp24,8jt"],
                ["Pesanan", "312"],
                ["Konversi", "8,4%"],
                ["Saldo", "Rp18,2jt"],
              ].map(([a, b], i) => (
                <div
                  key={a}
                  className="rounded-xl border border-[#173f2c]/8 bg-white p-3 sm:p-4"
                >
                  <p className="text-[9px] font-bold tracking-wider text-[#7d8982] uppercase">
                    {a}
                  </p>
                  <p className="mt-2 text-base font-extrabold tracking-tight sm:text-xl">
                    {b}
                  </p>
                  <p className="mt-1 text-[9px] font-bold text-[#2c7b52]">
                    {i < 3 ? "↑ 12,4%" : "Siap ditarik"}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1.7fr_1fr]">
              <div className="rounded-xl border border-[#173f2c]/8 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-[#7d8982]">
                      PENDAPATAN
                    </p>
                    <p className="mt-1 text-sm font-extrabold">Rp24.860.000</p>
                  </div>
                  <span className="rounded-lg bg-[#eef2e8] px-2 py-1 text-[9px] font-bold">
                    30 hari
                  </span>
                </div>
                <div className="mt-5 flex h-28 items-end gap-1.5">
                  {bars.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-[#173f2c] transition-all"
                      style={{ height: `${h}%`, opacity: 0.3 + i / 17 }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-[#d7ff64] p-4">
                <p className="text-[10px] font-bold tracking-wider text-[#486027] uppercase">
                  Produk teratas
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <ProductArt
                    palette="#173f2c"
                    glyph="AI"
                    className="size-12 shrink-0 !rounded-xl text-[#d7ff64]"
                  />
                  <div>
                    <p className="text-xs font-extrabold">AI Prompt Pack</p>
                    <p className="text-[10px] text-[#486027]">428 terjual</p>
                  </div>
                </div>
                <div className="mt-5 border-t border-black/10 pt-3 text-[10px] font-bold">
                  Lihat laporan <ArrowUpRight className="ml-1 inline size-3" />
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-[#173f2c]/8 bg-white p-4">
              <div className="mb-3 flex justify-between">
                <p className="text-[10px] font-bold tracking-wider text-[#7d8982] uppercase">
                  Pesanan terbaru
                </p>
                <MoreHorizontal className="size-4" />
              </div>
              {[
                ["Nadia Putri", "AI Prompt Pack", "Rp79.000"],
                ["Rizky Hidayat", "n8n Automation", "Rp149.000"],
              ].map((x) => (
                <div
                  key={x[0]}
                  className="grid grid-cols-[1fr_1fr_auto] border-t border-[#173f2c]/6 py-2 text-[9px] sm:text-[10px]"
                >
                  <b>{x[0]}</b>
                  <span className="text-[#7d8982]">{x[1]}</span>
                  <b>{x[2]}</b>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
      <div className="shadow-float absolute -right-4 bottom-14 hidden rounded-2xl border border-white/70 bg-white/90 p-4 backdrop-blur-xl lg:block">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[#bdf8d0]">
            <Check className="size-4" />
          </span>
          <div>
            <p className="text-[10px] text-[#7a877f]">Pembayaran masuk</p>
            <p className="text-sm font-extrabold">+ Rp149.000</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MiniCheckout() {
  return (
    <div className="landing-demo-light shadow-float relative mx-auto w-full max-w-[420px] rotate-[2deg] rounded-[34px] border border-white/10 bg-[#f9f8f3] p-4 text-[#17231d] transition duration-500 hover:rotate-0 sm:p-6">
      <div className="hairline flex items-center gap-3 border-b pb-5">
        <ProductArt
          palette="#e9ff9b"
          glyph="AI"
          className="size-14 shrink-0 !rounded-2xl"
        />
        <div>
          <p className="text-xs font-bold text-[#68756d]">Asep AI Tools</p>
          <h4 className="font-extrabold">AI Prompt Pack</h4>
        </div>
        <b className="ml-auto text-sm">Rp79.000</b>
      </div>
      <div className="py-5">
        <p className="text-[11px] font-extrabold tracking-wider text-[#68756d] uppercase">
          Bayar dengan QRIS
        </p>
        <div className="hairline mx-auto mt-4 grid size-48 place-items-center rounded-3xl border bg-white shadow-sm">
          <QrCode strokeWidth={1.2} className="size-36 text-[#173f2c]" />
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold">
          <span className="size-2 animate-pulse rounded-full bg-[#ff794d]" />{" "}
          Berakhir dalam 14:32
        </div>
      </div>
      <div className="rounded-2xl bg-[#edf0e9] p-4 text-center text-xs leading-5 text-[#5f6d64]">
        Scan dengan GoPay, DANA, OVO, ShopeePay, atau mobile banking favoritmu.
      </div>
    </div>
  );
}
