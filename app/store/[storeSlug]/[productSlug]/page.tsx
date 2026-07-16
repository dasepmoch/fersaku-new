import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Download,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { ProductArt } from "@/components/product-art";
import { getPublicStorefront } from "@/features/catalog/api";
import {
  listPublicProductReviews,
  getPublicProductRating,
} from "@/features/seller/reviews/api";
import { rupiah } from "@/lib/utils";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ storeSlug: string; productSlug: string }>;
}) {
  const { storeSlug, productSlug } = await params;
  const store = await getPublicStorefront(storeSlug);
  const p = store?.products.find((x) => x.slug === productSlug);
  if (!store || !p) notFound();
  const [ratingSummary, reviews] = await Promise.all([
    getPublicProductRating(p.id),
    listPublicProductReviews(p.id),
  ]);
  return (
    <main className="min-h-screen bg-[#f8f7f2]">
      <header className="mx-auto flex h-20 max-w-[1240px] items-center justify-between px-5 lg:px-8">
        <Logo />
        <Link
          href={`/@${store.slug}`}
          className="flex items-center gap-2 text-xs font-bold text-[#627068]"
        >
          <ArrowLeft className="size-4" /> Kembali ke toko
        </Link>
      </header>
      <section className="mx-auto grid max-w-[1180px] gap-10 px-5 pt-8 pb-24 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pt-14">
        <div>
          <ProductArt
            palette={p.palette}
            glyph={p.glyph}
            title={p.type}
            className="aspect-[1.1] sm:aspect-[1.25] lg:sticky lg:top-8"
          />
        </div>
        <div className="lg:px-6">
          <div className="flex items-center gap-2 text-xs font-bold text-[#65736b]">
            <span
              className="grid size-7 place-items-center rounded-lg text-[#173f2c]"
              style={{ backgroundColor: store.accent }}
            >
              {store.monogram}
            </span>
            {store.name}{" "}
            <BadgeCheck className="size-4 fill-[#315d47] text-white" />
          </div>
          {p.badge && (
            <span className="mt-7 inline-flex rounded-full bg-[#ffdfd1] px-3 py-1.5 text-[9px] font-extrabold tracking-wider text-[#874d39] uppercase">
              {p.badge}
            </span>
          )}
          <h1 className="font-display mt-5 text-6xl leading-[.9] tracking-[-.045em] sm:text-7xl">
            {p.title}
          </h1>
          <p className="mt-6 text-base leading-7 text-[#647169]">
            {p.description}
          </p>
          <div className="hairline mt-8 flex items-end justify-between border-y py-6">
            <div>
              <p className="text-[10px] font-extrabold tracking-wider text-[#7c8881] uppercase">
                Harga sekali bayar
              </p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">
                {rupiah(p.price)}
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-[#6c7971]">
              <Sparkles className="size-4" />
              {p.sales} pembeli
            </span>
          </div>
          <Link
            href={`/checkout/${p.id}?store=${store.slug}`}
            className="mt-6 flex h-14 items-center justify-center rounded-2xl bg-[#173f2c] text-sm font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#0e3020]"
          >
            Beli sekarang — {rupiah(p.price)}
          </Link>
          <div className="mt-4 flex items-center justify-center gap-4 text-[10px] font-bold text-[#7a867f]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3.5" /> Checkout aman
            </span>
            <span className="flex items-center gap-1">
              <LockKeyhole className="size-3.5" /> Bayar via QRIS
            </span>
          </div>
          <div className="hairline shadow-card mt-10 rounded-[28px] border bg-white p-6">
            <h2 className="font-extrabold">Yang akan kamu dapatkan</h2>
            <div className="mt-5 grid gap-4">
              {p.includes.map((x) => (
                <div key={x} className="flex items-center gap-3 text-sm">
                  <span className="grid size-6 place-items-center rounded-full bg-[#e5f6e7] text-[#276b49]">
                    <Check className="size-3.5" />
                  </span>
                  {x}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex gap-4 rounded-[24px] bg-[#edf0e9] p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white">
              <Download className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold">Pengiriman otomatis</h3>
              <p className="mt-1 text-xs leading-5 text-[#6f7b74]">
                Setelah pembayaran berhasil, akses produk langsung muncul dan
                dikirim ke emailmu.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1180px] px-5 pb-24 lg:px-8">
        <div className="hairline grid gap-8 border-t pt-16 lg:grid-cols-[320px_1fr]">
          <div>
            <p className="text-[10px] font-extrabold tracking-[.15em] text-[#315d47] uppercase">
              Ulasan pembeli
            </p>
            <div className="mt-5 flex items-end gap-3">
              <b className="font-display text-7xl leading-none">
                {ratingSummary.average}
              </b>
              <div className="pb-1">
                <div className="flex text-[#e8a72e]">
                  {[1, 2, 3, 4, 5].map((x) => (
                    <Star key={x} className="size-4 fill-current" />
                  ))}
                </div>
                <p className="mt-1 text-[9px] text-[#718078]">
                  {ratingSummary.total} ulasan terverifikasi
                </p>
              </div>
            </div>
            <div className="mt-7 grid gap-2">
              {[5, 4, 3, 2, 1].map((score) => (
                <div key={score} className="flex items-center gap-2 text-[8px]">
                  <span className="w-3">{score}</span>
                  <Star className="size-3 fill-[#e8a72e] text-[#e8a72e]" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#edf0e9]">
                    <div
                      className="h-full rounded-full bg-[#e8a72e]"
                      style={{
                        width: `${(ratingSummary.distribution[score as keyof typeof ratingSummary.distribution] / ratingSummary.total) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-5 text-right text-[#718078]">
                    {
                      ratingSummary.distribution[
                        score as keyof typeof ratingSummary.distribution
                      ]
                    }
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-6 flex items-center gap-2 text-[9px] leading-5 text-[#718078]">
              <BadgeCheck className="size-4 text-[#315d47]" /> Hanya pembeli
              dengan order paid yang dapat menulis ulasan.
            </p>
          </div>
          <div className="grid gap-4">
            {reviews
              .filter(
                (review) =>
                  review.productId === p.id && review.status === "Published",
              )
              .map((review) => (
                <article
                  key={review.id}
                  className="hairline shadow-card rounded-[24px] border bg-white p-5"
                >
                  <div className="flex items-start">
                    <span className="grid size-10 place-items-center rounded-full bg-[#e8ebe4] text-[9px] font-black">
                      {review.initials}
                    </span>
                    <div className="ml-3">
                      <div className="flex items-center gap-2">
                        <b className="text-[10px]">{review.buyer}</b>
                        {review.verified && (
                          <BadgeCheck className="size-3.5 fill-[#315d47] text-white" />
                        )}
                      </div>
                      <div className="mt-1 flex text-[#e8a72e]">
                        {[1, 2, 3, 4, 5].map((x) => (
                          <Star
                            key={x}
                            className={`size-3 ${x <= review.rating ? "fill-current" : "opacity-25"}`}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="ml-auto text-[8px] text-[#718078]">
                      {review.createdAt}
                    </span>
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold">
                    {review.title}
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-[#718078]">
                    {review.body}
                  </p>
                  {review.sellerReply && (
                    <div className="mt-4 rounded-2xl bg-[#eef3e9] p-4">
                      <p className="text-[8px] font-extrabold tracking-wider text-[#315d47] uppercase">
                        Balasan seller
                      </p>
                      <p className="mt-2 text-[9px] leading-5 text-[#65736b]">
                        {review.sellerReply}
                      </p>
                    </div>
                  )}
                </article>
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}
