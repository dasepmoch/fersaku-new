import { Gift } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import type {
  CatalogProduct as Product,
  PublicStorefront as StorefrontConfig,
} from "@/features/catalog/contracts";
import { rupiah } from "@/lib/utils";

export function CheckoutOrderSummary({
  product,
  store,
  base,
  tip,
  upsell,
  upsellProduct,
  upsellPrice,
  total,
}: {
  product: Product;
  store: StorefrontConfig;
  base: number;
  tip: number;
  upsell: boolean;
  upsellProduct: Product | undefined;
  upsellPrice: number;
  total: number;
}) {
  return (
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
  );
}
