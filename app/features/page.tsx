import {
  BarChart3,
  Check,
  Code2,
  Download,
  Globe2,
  KeyRound,
  Link2,
  PackageCheck,
  QrCode,
  Store,
  TicketPercent,
  Wallet,
} from "lucide-react";
import { MarketingHero, MarketingShell } from "@/components/marketing-shell";
import { ProductArt } from "@/components/product-art";

const groups = [
  {
    title: "Jual dengan gayamu",
    desc: "Toko yang terasa seperti brand milikmu, bukan halaman marketplace.",
    color: "#e9ff9b",
    items: [
      [Store, "Storefront hosted"],
      [Globe2, "Custom domain"],
      [TicketPercent, "Kupon fleksibel"],
      [BarChart3, "Analitik jernih"],
    ],
  },
  {
    title: "Pembayaran yang sederhana",
    desc: "Satu QR untuk seluruh aplikasi pembayaran favorit pelanggan Indonesia.",
    color: "#ffb69d",
    items: [
      [QrCode, "QRIS universal"],
      [PackageCheck, "Status real-time"],
      [Wallet, "Saldo transparan"],
      [Check, "Payout bank lokal"],
    ],
  },
  {
    title: "Delivery tanpa tangan",
    desc: "Begitu pembayaran masuk, Fersaku langsung mengirim karya terbaikmu.",
    color: "#c9defd",
    items: [
      [Download, "File download"],
      [Link2, "Protected link"],
      [KeyRound, "Stock code"],
      [Code2, "API & webhook"],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Mesin jualan yang tenang"
        title={
          <>
            Semua fitur. Tanpa <em className="text-[#315d47]">keribetan.</em>
          </>
        }
        description="Dari storefront sampai uang masuk ke rekening, setiap bagian dirancang agar terasa sederhana untukmu dan pembelimu."
      />
      <section className="px-5 pb-28 lg:px-8">
        <div className="mx-auto max-w-[1180px] space-y-5">
          {groups.map((g, i) => (
            <article
              key={g.title}
              className={`hairline shadow-card grid overflow-hidden rounded-[36px] border bg-white lg:grid-cols-2 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}
            >
              <div className="p-8 sm:p-12 lg:p-16">
                <span className="text-[11px] font-extrabold tracking-[.16em] text-[#718078] uppercase">
                  0{i + 1} / 03
                </span>
                <h2 className="font-display mt-10 text-5xl leading-[.95] tracking-[-.04em] sm:text-6xl">
                  {g.title}
                </h2>
                <p className="mt-5 max-w-md text-sm leading-6 text-[#69766f]">
                  {g.desc}
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {g.items.map(([Icon, label]) => (
                    <div
                      key={label as string}
                      className="flex items-center gap-3 rounded-2xl bg-[#f5f5f0] px-4 py-3 text-xs font-bold"
                    >
                      <Icon className="size-4" />
                      {label as string}
                    </div>
                  ))}
                </div>
              </div>
              <div
                className="relative min-h-[400px] overflow-hidden p-8"
                style={{ backgroundColor: g.color }}
              >
                <div className="absolute -top-24 -right-24 size-80 rounded-full border border-black/10" />
                <div className="shadow-float absolute inset-x-8 bottom-[-40px] rounded-[30px] border border-black/10 bg-[#fbfaf6] p-5">
                  <div className="hairline flex items-center justify-between border-b pb-4">
                    <b className="text-sm">
                      {i === 0
                        ? "Asep AI Tools"
                        : i === 1
                          ? "Pembayaran berhasil"
                          : "Delivery terkirim"}
                    </b>
                    <span className="rounded-full bg-[#bdf8d0] px-3 py-1 text-[9px] font-extrabold">
                      AKTIF
                    </span>
                  </div>
                  {i === 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <ProductArt
                        palette="#d7ff64"
                        glyph="AI"
                        className="aspect-square"
                      />
                      <ProductArt
                        palette="#c9defd"
                        glyph="//"
                        className="aspect-square"
                      />
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#173f2c] text-white">
                        <Check className="size-7" />
                      </span>
                      <p className="mt-4 text-xl font-extrabold">
                        {i === 1 ? "Rp149.000" : "AI Prompt Pack"}
                      </p>
                      <p className="mt-1 text-xs text-[#718078]">
                        {i === 1
                          ? "diterima dari Nadia"
                          : "dikirim ke nadia@studio.id"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
