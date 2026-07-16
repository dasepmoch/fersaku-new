import {
  ArrowRight,
  Gift,
  Minus,
  Plus,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { CatalogProduct as Product } from "@/features/catalog/contracts";
import { rupiah } from "@/lib/utils";
import { Field } from "./pieces";

export function CheckoutDetailsStep({
  product,
  name,
  setName,
  email,
  setEmail,
  customPrice,
  setCustomPrice,
  tip,
  setTip,
  upsell,
  setUpsell,
  upsellProduct,
  upsellPrice,
  total,
  valid,
  onContinue,
}: {
  product: Product;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  customPrice: number;
  setCustomPrice: (value: number | ((prev: number) => number)) => void;
  tip: number;
  setTip: (value: number) => void;
  upsell: boolean;
  setUpsell: (value: boolean | ((prev: boolean) => boolean)) => void;
  upsellProduct: Product | undefined;
  upsellPrice: number;
  total: number;
  valid: boolean;
  onContinue: () => void;
}) {
  return (
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
            <b className="text-[10px]">Tentukan harga yang terasa tepat</b>
          </div>
          <p className="mt-1 text-[9px] text-[#65736b]">
            Minimum {rupiah(product.minimumPrice || product.price)}. Selisihnya
            langsung mendukung kreator.
          </p>
          <div className="hairline mt-3 flex h-12 overflow-hidden rounded-xl border bg-white">
            <span className="checkout-price-prefix flex items-center bg-[#eef0eb] px-3 text-xs font-bold">
              Rp
            </span>
            <input
              type="number"
              min={product.minimumPrice || product.price}
              aria-label="Harga produk"
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
          <b className="text-[10px]">Tambahkan dukungan untuk kreator</b>
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
              <b className="text-[10px]">Tambah {upsellProduct.title}</b>
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
        onClick={onContinue}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f2c] text-sm font-extrabold text-white disabled:opacity-35"
      >
        Bayar {rupiah(total)} <ArrowRight className="size-4" />
      </button>
      <p className="mt-4 flex items-center justify-center gap-1 text-[10px] font-bold text-[#7e8983]">
        <ShieldCheck className="size-3.5" /> Pembayaran terenkripsi dan aman
      </p>
    </div>
  );
}
