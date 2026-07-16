import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Check,
  Code2,
  Download,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  WalletCards,
  Zap,
} from "lucide-react";
import { DashboardPreview, MiniCheckout } from "@/components/landing-previews";
import { Eyebrow, PrimaryButton } from "@/components/brand";
import { PublicNav } from "@/components/public-nav";
import { Footer } from "@/components/footer";
import { ProductArt } from "@/components/product-art";
import { RotatingQuote } from "@/components/rotating-quote";
import { listFeaturedProducts } from "@/features/catalog/api";

const features = [
  [
    Store,
    "Toko milikmu",
    "Etalase cantik dengan link unik yang siap dibagikan ke mana saja.",
    "#e9ff9b",
  ],
  [
    QrCode,
    "Checkout QRIS",
    "Satu metode yang dipahami semua orang. Ringkas, cepat, dan mobile-first.",
    "#bdebd0",
  ],
  [
    Download,
    "Kirim otomatis",
    "File, link, atau kode terkirim otomatis setelah pembayaran terkonfirmasi.",
    "#c9defd",
  ],
  [
    BarChart3,
    "Analitik yang jernih",
    "Ketahui produk terbaik, sumber penjualan, dan pertumbuhan pendapatanmu.",
    "#ffe69a",
  ],
  [
    WalletCards,
    "Saldo & penarikan",
    "Pantau saldo secara transparan dan tarik ke rekening bank lokal.",
    "#ffb69d",
  ],
  [
    Code2,
    "API untuk builder",
    "Bangun alur jualanmu sendiri dengan API checkout, QRIS, dan webhook.",
    "#d5c8ff",
  ],
];

export const dynamic = "force-dynamic";

export default async function Home() {
  const products = await listFeaturedProducts(6);

  return (
    <main className="landing-page overflow-hidden">
      <section className="noise relative min-h-screen bg-[#f8f7f2]">
        <div className="grid-fade absolute inset-x-0 top-0 h-[720px]" />
        <div className="absolute top-28 left-[-100px] size-72 rounded-full bg-[#d7ff64]/35 blur-[90px]" />
        <div className="absolute top-72 right-[-80px] size-72 rounded-full bg-[#bdf8d0]/60 blur-[100px]" />
        <PublicNav />
        <div className="relative mx-auto max-w-[1100px] px-5 pt-16 pb-16 text-center lg:pt-24">
          <div className="animate-rise">
            <Eyebrow>Commerce baru untuk Indonesia</Eyebrow>
          </div>
          <h1 className="animate-rise font-display mx-auto max-w-[900px] text-[clamp(4rem,9vw,8.2rem)] leading-[.82] tracking-[-.055em] text-balance">
            Karyamu layak dijual dengan{" "}
            <em className="relative font-normal text-[#255d42]">
              indah.
              <svg
                className="absolute -bottom-3 left-0 w-full"
                viewBox="0 0 220 10"
                fill="none"
              >
                <path
                  d="M2 8C59 2 153 1 218 5"
                  stroke="#ff794d"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </em>
          </h1>
          <p className="animate-rise-2 mx-auto mt-9 max-w-[620px] text-base leading-7 font-medium text-[#647169] sm:text-lg">
            Buat toko, unggah produk digital, terima pembayaran QRIS, dan kirim
            pesanan otomatis. Semuanya dari satu tempat yang terasa
            menyenangkan.
          </p>
          <div className="animate-rise-2 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryButton href="/register" className="w-full sm:w-auto">
              Mulai jualan gratis
            </PrimaryButton>
            <Link
              href="/@asep-ai-tools"
              className="hairline inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border bg-white/65 px-6 text-sm font-bold backdrop-blur transition hover:bg-white sm:w-auto"
            >
              Lihat toko demo <ArrowRight className="size-4" />
            </Link>
          </div>
          <p className="animate-rise-3 mt-5 text-[11px] font-bold tracking-[.13em] text-[#8a958e] uppercase">
            Tanpa biaya bulanan • Siap dalam 3 menit
          </p>
        </div>
        <DashboardPreview />
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-center gap-x-8 gap-y-4 px-5 py-14 text-[11px] font-bold tracking-[.12em] text-[#7b877f] uppercase">
          <span>Dipercaya kreator dari</span>
          {["RUANGGURU", "eFishery", "Kitabisa", "SIRCLO", "Mekari"].map(
            (x) => (
              <span
                key={x}
                className="text-sm font-extrabold tracking-[-.04em] text-[#405047]/60"
              >
                {x}
              </span>
            ),
          )}
        </div>
      </section>

      <section className="bg-[#173f2c] px-5 py-24 text-white lg:px-8 lg:py-36">
        <div className="mx-auto max-w-[1180px]">
          <Eyebrow dark>Semua yang kamu butuhkan</Eyebrow>
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <h2 className="font-display max-w-[740px] text-5xl leading-[.95] tracking-[-.04em] sm:text-7xl">
              Dari ide di kepalamu, sampai rupiah di rekeningmu.
            </h2>
            <p className="max-w-sm text-sm leading-6 text-white/55">
              Fersaku mengurus bagian yang membosankan, supaya kamu bisa terus
              berkarya.
            </p>
          </div>
          <div className="mt-14 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {features.map(([Icon, title, body, color]) => (
              <article
                key={title as string}
                className="group rounded-[26px] border border-white/10 bg-white/[.045] p-6 transition duration-300 hover:-translate-y-1 hover:bg-white/[.075]"
              >
                <span
                  className="grid size-11 place-items-center rounded-2xl text-[#173f2c]"
                  style={{ backgroundColor: color as string }}
                >
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-8 text-lg font-extrabold">
                  {title as string}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/50">
                  {body as string}
                </p>
                <ArrowRight className="mt-7 size-4 text-white/30 transition group-hover:translate-x-1 group-hover:text-[#d7ff64]" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-36">
        <div className="mx-auto max-w-[1180px]">
          <div className="text-center">
            <Eyebrow>Dibuat untuk segala ide</Eyebrow>
            <h2 className="font-display text-5xl leading-none tracking-[-.04em] sm:text-7xl">
              Jual apa yang kamu tahu.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-[#68756d]">
              Ebook, template, preset, source code, kelas, atau sesuatu yang
              belum pernah terpikirkan sebelumnya.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.slice(0, 6).map((p, i) => (
              <Link
                href={`/@asep-ai-tools/${p.slug}`}
                key={p.id}
                className={`group hairline shadow-card rounded-[30px] border bg-white p-3 transition hover:-translate-y-1 ${i === 0 ? "sm:col-span-2 lg:col-span-1" : ""}`}
              >
                <ProductArt
                  palette={p.palette}
                  glyph={p.glyph}
                  title={p.type}
                  className="aspect-[1.25]"
                />
                <div className="p-3 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-extrabold tracking-tight">
                        {p.title}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-xs text-[#718078]">
                        {p.short}
                      </p>
                    </div>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="noise bg-[#f1b99f] px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto grid max-w-[1180px] items-center gap-16 lg:grid-cols-2">
          <div>
            <Eyebrow>Satu scan, selesai</Eyebrow>
            <h2 className="font-display text-6xl leading-[.9] tracking-[-.045em] sm:text-8xl">
              Checkout tanpa drama.
            </h2>
            <p className="mt-7 max-w-lg text-base leading-7 text-[#543d32]/70">
              Tak ada pilihan pembayaran yang membingungkan. Pembeli cukup scan
              QRIS, bayar dari aplikasi favorit, lalu produk langsung terkirim.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Semua aplikasi QRIS",
                "Konfirmasi otomatis",
                "Mobile-first",
                "Pengiriman instan",
              ].map((x) => (
                <div
                  key={x}
                  className="flex items-center gap-3 text-sm font-bold"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-[#173f2c] text-white">
                    <Check className="size-3.5" />
                  </span>
                  {x}
                </div>
              ))}
            </div>
          </div>
          <MiniCheckout />
        </div>
      </section>

      <section className="bg-[#eef1e9] px-5 py-24 lg:px-8 lg:py-36">
        <div className="mx-auto grid max-w-[1180px] overflow-hidden rounded-[40px] bg-[#101b16] text-white lg:grid-cols-2">
          <div className="p-8 sm:p-14 lg:p-16">
            <Eyebrow dark>Untuk developer</Eyebrow>
            <h2 className="font-display text-5xl leading-[.95] tracking-[-.04em] sm:text-7xl">
              QRIS API yang enak dipakai.
            </h2>
            <p className="mt-6 max-w-md text-sm leading-6 text-white/55">
              Buat checkout, pantau pembayaran, dan otomatisasi delivery dengan
              API yang konsisten dan dokumentasi yang manusiawi.
            </p>
            <PrimaryButton
              href="/docs/api"
              className="mt-8 !bg-[#d7ff64] !text-[#173f2c]"
            >
              Baca dokumentasi
            </PrimaryButton>
          </div>
          <div className="relative min-h-[420px] bg-[#182820] p-5 sm:p-10">
            <div className="grid-fade absolute inset-0 opacity-20" />
            <div className="shadow-float relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d1712]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="size-2 rounded-full bg-[#ff794d]" />
                <span className="size-2 rounded-full bg-[#ffe69a]" />
                <span className="size-2 rounded-full bg-[#bdf8d0]" />
                <span className="ml-2 text-[10px] text-white/30">
                  create-payment.ts
                </span>
              </div>
              <pre className="overflow-x-auto p-5 text-[11px] leading-6 text-white/70">
                <code>{`const payment = await fersaku.qris.create({\n  amount: 99000,\n  currency: "IDR",\n  customer: {\n    name: "Budi",\n    email: "budi@example.com"\n  }\n});\n\n// payment.status → "pending"`}</code>
              </pre>
            </div>
            <div className="relative mt-4 ml-auto flex w-fit items-center gap-3 rounded-xl border border-[#d7ff64]/20 bg-[#d7ff64]/10 px-4 py-3">
              <Zap className="size-4 text-[#d7ff64]" />
              <span className="text-xs font-bold">
                Webhook terkirim dalam 84ms
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-36">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              [
                "01",
                "Buka tokomu",
                "Pilih nama, atur tampilan, dan tokomu langsung online.",
              ],
              [
                "02",
                "Tambahkan karya",
                "Unggah file, tempel link, atau masukkan stok kode.",
              ],
              [
                "03",
                "Bagikan & jual",
                "Terima QRIS. Kami mengirim produk dan mencatat saldomu.",
              ],
            ].map(([no, t, d]) => (
              <article
                key={no}
                className="hairline shadow-card relative overflow-hidden rounded-[30px] border bg-white p-7"
              >
                <span className="landing-step-number font-display text-6xl text-[#173f2c]/12">
                  {no}
                </span>
                <h3 className="mt-12 text-xl font-extrabold">{t}</h3>
                <p className="mt-3 text-sm leading-6 text-[#6c7971]">{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#173f2c] px-5 py-24 text-white lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <div className="landing-force-ink rounded-[34px] bg-[#d7ff64] p-8 text-[#173f2c] sm:p-12">
              <p className="text-[10px] font-extrabold tracking-[.15em] uppercase">
                Saldo & payout lokal
              </p>
              <h2 className="font-display mt-8 text-5xl leading-[.92] tracking-[-.04em] sm:text-7xl">
                Dari checkout ke rekening, transparan.
              </h2>
              <p className="mt-6 max-w-lg text-sm leading-6 text-[#52613e]">
                Setiap rupiah tercatat dalam ledger. Pantau saldo pending,
                biaya, settlement, dan tarik dana ke rekening bank Indonesia.
              </p>
              <div className="mt-8 rounded-2xl bg-[#173f2c] p-5 text-white">
                <p className="text-[9px] tracking-wider text-white/45 uppercase">
                  Saldo tersedia
                </p>
                <div className="mt-2 flex items-end justify-between">
                  <b className="text-3xl">Rp18.240.500</b>
                  <span className="rounded-full bg-[#d7ff64] px-3 py-1.5 text-[9px] font-extrabold text-[#173f2c]">
                    Siap ditarik
                  </span>
                </div>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-[30px] border border-white/10 bg-white/[.05] p-7">
                <p className="font-display text-3xl leading-tight">
                  “Fersaku membuat proses beli terasa seperti bagian dari brand,
                  bukan sekadar formulir bayar.”
                </p>
                <div className="mt-8 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-[#ffb69d] text-[10px] font-black text-[#173f2c]">
                    AR
                  </span>
                  <div>
                    <b className="block text-xs">Alya Rahman</b>
                    <span className="text-[9px] text-white/40">
                      DesignKit Studio
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[26px] border border-white/10 bg-white/[.05] p-6">
                  <b className="text-3xl">8,4%</b>
                  <p className="mt-2 text-[9px] text-white/45">
                    Rata-rata conversion toko pilihan
                  </p>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-white/[.05] p-6">
                  <b className="text-3xl">&lt; 2s</b>
                  <p className="mt-2 text-[9px] text-white/45">
                    Konfirmasi pembayaran mock
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 lg:px-8">
        <RotatingQuote className="mx-auto max-w-[1000px]" />
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1000px]">
          <div className="text-center">
            <Eyebrow>Pertanyaan umum</Eyebrow>
            <h2 className="font-display text-5xl tracking-[-.04em] sm:text-7xl">
              Sebelum kamu mulai.
            </h2>
          </div>
          <div className="mt-12 grid gap-3">
            {[
              [
                "Apakah ada biaya bulanan?",
                "Starter gratis digunakan. Biaya platform hanya dipotong saat kamu berhasil menjual.",
              ],
              [
                "Produk apa saja yang bisa dijual?",
                "File digital, protected link, serta stok kode seperti license key dan voucher.",
              ],
              [
                "Bagaimana pembeli membayar?",
                "MVP menggunakan QRIS sehingga pembeli dapat membayar dari e-wallet atau mobile banking favoritnya.",
              ],
              [
                "Kapan saldo bisa ditarik?",
                "Setelah masa settlement selesai, saldo tersedia dapat diajukan ke rekening bank lokal.",
              ],
              [
                "Apakah tersedia API?",
                "Ya. Developer dapat membuat QRIS payment, checkout session, membaca order, dan menerima webhook.",
              ],
            ].map(([q, a]) => (
              <details
                key={q}
                className="group hairline shadow-card rounded-2xl border bg-white p-5"
              >
                <summary className="cursor-pointer list-none text-sm font-extrabold">
                  {q}
                  <span className="float-right text-xl font-normal transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-4 max-w-3xl text-xs leading-6 text-[#6c7971]">
                  {a}
                </p>
              </details>
            ))}
          </div>
          <div className="hairline shadow-card mt-12 grid gap-4 rounded-[30px] border bg-white p-7 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[10px] font-extrabold tracking-wider text-[#315d47] uppercase">
                Harga sederhana
              </p>
              <h3 className="font-display mt-2 text-4xl">
                Gratis untuk mulai. Pro saat bertumbuh.
              </h3>
              <p className="mt-2 text-xs text-[#6c7971]">
                Starter 3% + biaya pembayaran. Pro mulai Rp99.000/bulan dengan
                fee lebih rendah.
              </p>
            </div>
            <Link
              href="/pricing"
              className="hairline inline-flex h-11 items-center justify-center rounded-full border px-5 text-xs font-extrabold"
            >
              Lihat harga lengkap
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 lg:px-8 lg:pb-32">
        <div className="landing-force-ink noise relative mx-auto max-w-[1180px] overflow-hidden rounded-[38px] bg-[#d7ff64] px-6 py-20 text-center sm:px-12">
          <div className="absolute top-10 left-10 size-20 rounded-full border border-black/10" />
          <div className="absolute right-[-50px] bottom-[-100px] size-72 rounded-full border border-black/10" />
          <Sparkles className="mx-auto size-7" />
          <h2 className="font-display mx-auto mt-6 max-w-3xl text-5xl leading-[.92] tracking-[-.04em] sm:text-7xl">
            Karya terbaikmu sudah siap bertemu pembelinya.
          </h2>
          <p className="mt-6 text-sm font-semibold text-[#40552e]">
            Buka toko pertamamu hari ini. Gratis sampai kamu berhasil jualan.
          </p>
          <PrimaryButton href="/register" className="mt-8">
            Mulai jualan sekarang
          </PrimaryButton>
          <div className="mt-6 flex items-center justify-center gap-5 text-[11px] font-bold text-[#53643f]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3.5" /> Aman
            </span>
            <span className="flex items-center gap-1">
              <BadgeCheck className="size-3.5" /> Tanpa kartu kredit
            </span>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
