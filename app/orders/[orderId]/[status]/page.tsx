import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  Download,
  FileText,
  Mail,
  RefreshCcw,
  X,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { ProductArt } from "@/components/product-art";
import {
  getOrderResult,
  isKnownOrderResultPathStatus,
  type OrderResult,
  type OrderResultDisplayState,
} from "@/features/commerce/order-result";
import { getOrderResultServer } from "@/features/commerce/order-result/server";
import { getDomainSource } from "@/shared/data/domain-source";
import { rupiah } from "@/shared/format/money";

export const dynamic = "force-dynamic";

const states = {
  success: {
    icon: Check,
    title: "Pembayaran berhasil!",
    desc: "Produkmu sudah siap. Receipt juga dikirim ke email.",
    color: "#d7ff64",
  },
  pending: {
    icon: Clock3,
    title: "Menunggu pembayaran",
    desc: "Kami masih menunggu konfirmasi pembayaran QRIS-mu.",
    color: "#ffe69a",
  },
  failed: {
    icon: X,
    title: "Pembayaran belum berhasil",
    desc: "Transaksi tidak dapat diproses. Tenang, tidak ada saldo yang terpotong.",
    color: "#ffb69d",
  },
};

async function loadOrderResult(orderId: string): Promise<OrderResult> {
  const source = getDomainSource("checkout");
  if (source === "disabled") notFound();
  if (source === "api") {
    // Session cookie / capability-safe SSR; foreign → notFound (no enumeration).
    return getOrderResultServer(orderId);
  }
  // Mock fixtures: adapter only — path status never applied as authority.
  const mock = await getOrderResult(orderId);
  if (!mock) notFound();
  return mock;
}

export default async function OrderStatePage({
  params,
}: {
  params: Promise<{ orderId: string; status: string }>;
}) {
  const { orderId, status: urlStatus } = await params;
  const result = await loadOrderResult(orderId);

  // Canonicalize mismatched pretty status from backend (no open redirect).
  // URL status is never authority for chrome selection.
  if (
    isKnownOrderResultPathStatus(urlStatus) &&
    urlStatus !== result.displayState
  ) {
    const prettyId = encodeURIComponent(result.orderNumber || result.orderId);
    redirect(`/orders/${prettyId}/${result.displayState}`);
  }

  return (
    <OrderResultChrome
      orderId={result.orderNumber || result.orderId}
      displayState={result.displayState}
      productTitle={result.productTitle}
      productPriceLabel={rupiah(result.gross)}
      productPalette={result.palette}
      productGlyph={result.glyph}
      productId={result.productId}
      productSlug={result.productSlug}
      storeSlug={result.storeSlug}
      showDeliveryShell={result.deliveryReadyShell}
    />
  );
}

/** Existing order status chrome — markup/class/copy frozen; data via props only. */
function OrderResultChrome({
  orderId,
  displayState,
  productTitle,
  productPriceLabel,
  productPalette,
  productGlyph,
  productId,
  productSlug,
  storeSlug,
  showDeliveryShell,
}: {
  orderId: string;
  displayState: OrderResultDisplayState;
  productTitle: string;
  productPriceLabel: string;
  productPalette: string;
  productGlyph: string;
  productId?: string;
  productSlug?: string;
  storeSlug?: string;
  showDeliveryShell: boolean;
}) {
  const current = states[displayState];
  const Icon = current.icon;
  const checkoutHref = productId
    ? `/checkout/${productId}`
    : productSlug && storeSlug
      ? `/@${storeSlug}/${productSlug}`
      : "/";
  const productHref =
    productSlug && storeSlug ? `/@${storeSlug}/${productSlug}` : "/";

  return (
    <main className="min-h-screen bg-[#f3f2ec]">
      <header className="mx-auto flex h-20 max-w-[1000px] items-center justify-center px-5">
        <Logo />
      </header>
      <section className="mx-auto max-w-[650px] px-5 pt-8 pb-20">
        <div className="hairline shadow-float rounded-[36px] border bg-[#fbfaf6] p-6 text-center sm:p-10">
          <span
            className="mx-auto grid size-20 place-items-center rounded-full"
            style={{ backgroundColor: current.color }}
          >
            <Icon className="size-8" />
          </span>
          <h1 className="font-display mt-6 text-5xl leading-none tracking-[-.04em] sm:text-6xl">
            {current.title}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#69766e]">
            {current.desc}
          </p>
          <div className="hairline mt-8 flex items-center gap-4 rounded-2xl border bg-white p-3 text-left">
            <ProductArt
              palette={productPalette}
              glyph={productGlyph}
              className="size-16 shrink-0 !rounded-xl"
            />
            <div>
              <p className="text-sm font-extrabold">{productTitle}</p>
              <p className="mt-1 text-[10px] font-bold text-[#7a867f]">
                Pesanan #{orderId}
              </p>
            </div>
            <b className="ml-auto text-xs">{productPriceLabel}</b>
          </div>
          {displayState === "success" && (
            <>
              {showDeliveryShell && (
                <div className="mt-5 rounded-2xl bg-[#eaf4e9] p-5 text-left">
                  <div className="flex items-center gap-2">
                    <Download className="size-4" />
                    <b className="text-sm">File siap diunduh</b>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#65736b]">
                    Link aktif selama 7 hari dengan maksimal 5 kali unduhan.
                  </p>
                  <button
                    type="button"
                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-sm font-extrabold text-white"
                  >
                    Unduh {productTitle} <ArrowRight className="size-4" />
                  </button>
                </div>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link
                  href={`/orders/${encodeURIComponent(orderId)}/invoice`}
                  className="hairline flex h-11 items-center justify-center gap-2 rounded-xl border bg-white text-[10px] font-extrabold"
                >
                  <FileText className="size-4" /> Unduh Invoice PDF Resmi
                </Link>
                <Link
                  href={`/account/purchases/${encodeURIComponent(orderId)}`}
                  className="hairline flex h-11 items-center justify-center gap-2 rounded-xl border bg-white text-[10px] font-extrabold"
                >
                  Buyer portal <ArrowRight className="size-4" />
                </Link>
              </div>
              <p className="mt-5 flex items-center justify-center gap-2 text-[10px] font-bold text-[#758179]">
                <Mail className="size-3.5" /> Dikirim ke email pembeli
              </p>
            </>
          )}
          {displayState === "pending" && (
            <>
              <div className="mt-5 rounded-2xl bg-[#fff6d8] p-4 text-xs leading-5 text-[#756438]">
                <AlertCircle className="mr-2 inline size-4" /> Selesaikan
                pembayaran sebelum QRIS kedaluwarsa.
              </div>
              <Link
                href={checkoutHref}
                className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-sm font-extrabold text-white"
              >
                Lihat QRIS <ArrowRight className="size-4" />
              </Link>
            </>
          )}
          {displayState === "failed" && (
            <>
              <Link
                href={checkoutHref}
                className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-sm font-extrabold text-white"
              >
                <RefreshCcw className="size-4" /> Coba bayar lagi
              </Link>
              <Link
                href={productHref}
                className="mt-4 block text-xs font-bold text-[#65736b]"
              >
                Kembali ke produk
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
